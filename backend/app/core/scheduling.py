import uuid
from datetime import datetime, timedelta
from typing import Optional, Tuple, List

from fastapi import HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.models.user import User
from app.models.event import Event
from app.models.event_snapshot import EventSnapshot
from app.models.event_participant import EventParticipant
from app.schemas.event import EventCreate, EventUpdate
from app.core.date_conversion import utc_to_local, local_to_utc
from app.core.recurrence import expand_occurrences, detect_series_conflicts, validate_recurrence_params

DEFAULT_DURATION_MINUTES = 60


def event_end_time(start: datetime, end: Optional[datetime]) -> datetime:
    if end is not None:
        return end
    return start + timedelta(minutes=DEFAULT_DURATION_MINUTES)


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def serialize_event(event: Event) -> dict:
    start_local = utc_to_local(event.start_time_utc, event.timezone)
    end_local = utc_to_local(event.end_time_utc, event.timezone)
    return {
        "id": event.id,
        "user_id": event.user_id,
        "version": event.version,
        "title": event.title,
        "description": event.description,
        "start_time_utc": event.start_time_utc.isoformat() if event.start_time_utc else None,
        "end_time_utc": event.end_time_utc.isoformat() if event.end_time_utc else None,
        "start_time_local": start_local.isoformat() if start_local else None,
        "end_time_local": end_local.isoformat() if end_local else None,
        "timezone": event.timezone,
        "reminder_minutes": event.reminder_minutes,
        "recurrence_group_id": event.recurrence_group_id,
        "recurrence_rule": event.recurrence_rule,
        "recurrence_interval": event.recurrence_interval,
        "recurrence_byday": event.recurrence_byday,
    }


def snapshot_event(db: Session, event: Event) -> None:
    snap = EventSnapshot(
        event_id=event.id,
        version=event.version,
        title=event.title,
        description=event.description,
        start_time_utc=event.start_time_utc,
        end_time_utc=event.end_time_utc,
        timezone=event.timezone,
        reminder_minutes=event.reminder_minutes,
    )
    db.add(snap)


def create_single_event(db: Session, user: User, payload: EventCreate) -> dict:
    try:
        start_utc = local_to_utc(payload.start_time_local, payload.timezone)
        end_utc = local_to_utc(payload.end_time_local, payload.timezone) if payload.end_time_local else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    event = Event(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        start_time_utc=start_utc,
        end_time_utc=end_utc,
        timezone=payload.timezone,
        reminder_minutes=payload.reminder_minutes,
        version=1,
    )
    db.add(event)
    db.flush()
    snapshot_event(db, event)
    db.commit()
    db.refresh(event)
    return serialize_event(event)


def create_recurring_series(db: Session, user: User, payload: EventCreate) -> dict:
    try:
        end_count, end_until, byday = validate_recurrence_params(
            end_type=payload.recurrence_end_type or "count",
            end_count_raw=payload.recurrence_end_count if payload.recurrence_end_count is not None else payload.recurrence_count,
            end_until_raw=payload.recurrence_end_until,
            byday_raw=payload.recurrence_byday,
            start_date=payload.start_time_local.date(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    duration = payload.end_time_local - payload.start_time_local if payload.end_time_local is not None else None
    local_occurrences = expand_occurrences(
        frequency=payload.recurrence_rule,
        interval=payload.recurrence_interval or 1,
        byday=byday,
        end_type=payload.recurrence_end_type or "count",
        end_count=end_count,
        end_until=end_until,
        base_start=payload.start_time_local,
        duration=duration,
    )
    if not local_occurrences:
        raise HTTPException(status_code=400, detail="Recurrence rule produced no occurrences")
    try:
        utc_occurrences = [
            (local_to_utc(ls, payload.timezone), local_to_utc(le, payload.timezone) if le else None)
            for ls, le in local_occurrences
        ]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    conflicts = detect_series_conflicts(utc_occurrences, db, user.id)
    group_id = str(uuid.uuid4())
    first_event = None
    for start_utc, end_utc in utc_occurrences:
        event = Event(
            user_id=user.id,
            title=payload.title,
            description=payload.description,
            start_time_utc=start_utc,
            end_time_utc=end_utc,
            timezone=payload.timezone,
            reminder_minutes=payload.reminder_minutes,
            version=1,
            recurrence_group_id=group_id,
            recurrence_rule=payload.recurrence_rule,
            recurrence_interval=payload.recurrence_interval or 1,
            recurrence_byday=payload.recurrence_byday,
        )
        db.add(event)
        db.flush()
        snapshot_event(db, event)
        if first_event is None:
            first_event = event
    db.commit()
    db.refresh(first_event)
    result = serialize_event(first_event)
    result["recurrence_created"] = len(utc_occurrences)
    result["recurrence_conflicts"] = conflicts
    return result


def apply_event_update(db: Session, event: Event, payload: EventUpdate) -> None:
    raw = payload.model_dump(exclude_unset=True)
    updates = dict(raw)
    updates.pop("version", None)
    new_timezone = updates.get("timezone", event.timezone)
    new_start_local = updates.pop("start_time_local", None)
    new_end_local = updates.pop("end_time_local", None)
    current_start_local = utc_to_local(event.start_time_utc, new_timezone)
    current_end_local = utc_to_local(event.end_time_utc, new_timezone)
    effective_start_local = new_start_local if new_start_local is not None else current_start_local
    effective_end_local = new_end_local if new_end_local is not None else current_end_local
    try:
        if effective_start_local is not None:
            event.start_time_utc = local_to_utc(effective_start_local, new_timezone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if "end_time_local" in raw:
        if new_end_local is None:
            event.end_time_utc = None
        else:
            if effective_start_local is not None and new_end_local <= effective_start_local:
                raise HTTPException(status_code=400, detail="end_time_local must be after start_time_local")
            try:
                event.end_time_utc = local_to_utc(new_end_local, new_timezone)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
    elif effective_end_local is not None and new_start_local is not None:
        if effective_end_local <= effective_start_local:
            raise HTTPException(status_code=400, detail="end_time_local must be after start_time_local")
        try:
            event.end_time_utc = local_to_utc(effective_end_local, new_timezone)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    for k, v in updates.items():
        setattr(event, k, v)
    event.version += 1
    db.commit()
    db.refresh(event)
    snapshot_event(db, event)
    db.commit()
    db.refresh(event)


def query_events(
    db: Session,
    user: User,
    q: str,
    timezone_filter: str,
    start_from: Optional[str],
    start_to: Optional[str],
    ownership: str,
    limit: int,
    offset: int,
) -> List[Event]:
    participant_event_ids = (
        db.query(EventParticipant.event_id)
        .filter(EventParticipant.user_id == user.id)
        .subquery()
    )
    if ownership == "owned":
        access_filter = Event.user_id == user.id
    elif ownership == "shared":
        access_filter = and_(Event.user_id != user.id, Event.id.in_(participant_event_ids))
    else:
        access_filter = or_(Event.user_id == user.id, Event.id.in_(participant_event_ids))
    query = db.query(Event).filter(access_filter)
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Event.title.ilike(term), Event.description.ilike(term)))
    if timezone_filter.strip():
        query = query.filter(Event.timezone == timezone_filter.strip())
    if start_from:
        query = query.filter(Event.start_time_utc >= start_from)
    if start_to:
        query = query.filter(Event.start_time_utc <= start_to)
    return query.order_by(Event.start_time_utc.asc()).offset(offset).limit(limit).all()
