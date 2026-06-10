import uuid
from datetime import date, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.core.recurrence import expand_occurrences, detect_series_conflicts
from app.models.user import User
from app.models.event import Event
from app.models.event_snapshot import EventSnapshot
from app.models.event_participant import EventParticipant
from app.schemas.event import EventCreate, EventUpdate
from app.schemas.participants import ShareEventIn

router = APIRouter(prefix="/events", tags=["events"])

def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def snapshot_event(db: Session, event: Event):
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

def utc_to_local(utc_dt, timezone_str: str):
    if not utc_dt:
        return None
    try:
        tz = ZoneInfo(timezone_str or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")

    return (
        utc_dt.replace(tzinfo=timezone.utc)
        .astimezone(tz)
        .replace(tzinfo=None)
    )

def serialize_event(event: Event):
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

def get_event_with_access(db: Session, user: User, event_id: int):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.user_id == user.id:
        return event, "owner"

    participant = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == user.id)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="You do not have access to this event")

    return event, participant.role

def require_editor_or_owner(role: str):
    if role not in ("owner", "editor"):
        raise HTTPException(status_code=403, detail="You do not have permission to modify this event")

def require_owner(role: str):
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")

def local_to_utc(local_dt, timezone_str: str):
    try:
        tz = ZoneInfo(timezone_str or "UTC")
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {timezone_str}")

    aware_local = local_dt.replace(tzinfo=tz)
    return aware_local.astimezone(timezone.utc).replace(tzinfo=None)

@router.post("")
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)

    if payload.start_time_local is None:
        raise HTTPException(status_code=400, detail="start_time_local is required")

    if payload.end_time_local is not None and payload.end_time_local <= payload.start_time_local:
        raise HTTPException(status_code=400, detail="end_time_local must be after start_time_local")

    duration = (
        payload.end_time_local - payload.start_time_local
        if payload.end_time_local is not None
        else None
    )

    if payload.recurrence_rule == "none":
        event = Event(
            user_id=user.id,
            title=payload.title,
            description=payload.description,
            start_time_utc=local_to_utc(payload.start_time_local, payload.timezone),
            end_time_utc=local_to_utc(payload.end_time_local, payload.timezone) if payload.end_time_local else None,
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

    if payload.recurrence_end_type == "until":
        if not payload.recurrence_end_until:
            raise HTTPException(status_code=400, detail="recurrence_end_until required when end_type='until'")
        try:
            end_until = date.fromisoformat(payload.recurrence_end_until)
        except ValueError:
            raise HTTPException(status_code=400, detail="recurrence_end_until must be YYYY-MM-DD")
        if end_until < payload.start_time_local.date():
            raise HTTPException(status_code=400, detail="recurrence_end_until must be on or after the start date")
        end_count = 500
    else:

        end_count = payload.recurrence_end_count if payload.recurrence_end_count is not None else payload.recurrence_count
        if end_count < 1 or end_count > 365:
            raise HTTPException(status_code=400, detail="Occurrence count must be between 1 and 365")
        end_until = None

    byday = [d.strip() for d in payload.recurrence_byday.split(",") if d.strip()] if payload.recurrence_byday else []

    valid_days = set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"])
    for d in byday:
        if d not in valid_days:
            raise HTTPException(status_code=400, detail=f"Invalid byday value: {d}")

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

    utc_occurrences = [
        (
            local_to_utc(ls, payload.timezone),
            local_to_utc(le, payload.timezone) if le else None,
        )
        for ls, le in local_occurrences
    ]

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

@router.get("")
def list_events(
    q: str = Query("", description="search title/description"),
    timezone: str = Query("", description="filter by timezone"),
    start_from: str | None = Query(None, description="ISO datetime lower bound"),
    start_to: str | None = Query(None, description="ISO datetime upper bound"),
    ownership: str = Query("all", description="all | owned | shared"),
    limit: int = Query(100, ge=1, le=500, description="NFR-P1: max results per page (1–500)"),
    offset: int = Query(0, ge=0, description="NFR-P1: number of results to skip for pagination"),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)

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
        query = query.filter(
            or_(
                Event.title.ilike(term),
                Event.description.ilike(term),
            )
        )

    if timezone.strip():
        query = query.filter(Event.timezone == timezone.strip())

    if start_from:
        query = query.filter(Event.start_time_utc >= start_from)

    if start_to:
        query = query.filter(Event.start_time_utc <= start_to)

    events = (
        query.order_by(Event.start_time_utc.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [serialize_event(event) for event in events]

@router.get("/{event_id}")
def get_event(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)
    return serialize_event(event)

@router.put("/{event_id}")
def update_event(
    event_id: int,
    payload: EventUpdate,
    force: bool = False,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_editor_or_owner(role)

    if not force and payload.version != event.version:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Version conflict",
                "code": "VERSION_CONFLICT",
                "event_id": event.id,
                "your_version": payload.version,
                "current_version": event.version,
                "current_event": serialize_event(event),
            },
        )

    updates = payload.model_dump(exclude_unset=True)
    updates.pop("version", None)

    new_timezone = updates.get("timezone", event.timezone)

    new_start_local = updates.pop("start_time_local", None)
    new_end_local = updates.pop("end_time_local", None)

    current_start_local = utc_to_local(event.start_time_utc, new_timezone)
    current_end_local = utc_to_local(event.end_time_utc, new_timezone)

    effective_start_local = new_start_local if new_start_local is not None else current_start_local
    effective_end_local = new_end_local if new_end_local is not None else current_end_local

    if effective_start_local is not None:
        event.start_time_utc = local_to_utc(effective_start_local, new_timezone)

    if "end_time_local" in payload.model_dump(exclude_unset=True):
        if new_end_local is None:
            event.end_time_utc = None
        else:
            if effective_start_local is not None and new_end_local <= effective_start_local:
                raise HTTPException(status_code=400, detail="end_time_local must be after start_time_local")
            event.end_time_utc = local_to_utc(new_end_local, new_timezone)
    elif effective_end_local is not None and new_start_local is not None:
        if effective_end_local <= effective_start_local:
            raise HTTPException(status_code=400, detail="end_time_local must be after start_time_local")
        event.end_time_utc = local_to_utc(effective_end_local, new_timezone)

    for k, v in updates.items():
        setattr(event, k, v)

    event.version += 1

    db.commit()
    db.refresh(event)

    snapshot_event(db, event)
    db.commit()
    db.refresh(event)

    return serialize_event(event)

@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)

    db.delete(event)
    db.commit()
    return {"deleted": True, "event_id": event_id}

@router.post("/{event_id}/share")
def share_event(event_id: int, payload: ShareEventIn, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)

    target = db.query(User).filter(User.email == payload.email).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")

    if target.id == event.user_id:
        raise HTTPException(status_code=400, detail="Owner already has access")

    existing = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == target.id)
        .first()
    )

    if existing:
        existing.role = payload.role
    else:
        db.add(EventParticipant(event_id=event_id, user_id=target.id, role=payload.role))

    db.commit()
    return {"shared": True, "event_id": event_id, "user_id": target.id, "role": payload.role}

@router.get("/{event_id}/participants")
def list_participants(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)

    participants = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event.id)
        .all()
    )

    owner = db.query(User).filter(User.id == event.user_id).first()
    result = [{
        "user_id": owner.id,
        "email": owner.email,
        "role": "owner"
    }]

    for p in participants:
        result.append({
            "user_id": p.user_id,
            "email": p.user.email,
            "role": p.role
        })

    return result

@router.get("/{event_id}/series")
def get_event_series(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)

    if not event.recurrence_group_id:
        return {"group_id": None, "total": 1, "events": [serialize_event(event)]}

    series = (
        db.query(Event)
        .filter(Event.recurrence_group_id == event.recurrence_group_id)
        .order_by(Event.start_time_utc.asc())
        .all()
    )

    return {
        "group_id": event.recurrence_group_id,
        "recurrence_rule": event.recurrence_rule,
        "recurrence_interval": event.recurrence_interval,
        "recurrence_byday": event.recurrence_byday,
        "total": len(series),
        "events": [serialize_event(e) for e in series],
    }

@router.delete("/{event_id}/series")
def delete_event_series(
    event_id: int,
    scope: str = Query("all", description="all | from_here"),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)

    if not event.recurrence_group_id:
        db.delete(event)
        db.commit()
        return {"deleted": 1, "scope": "single"}

    query = db.query(Event).filter(Event.recurrence_group_id == event.recurrence_group_id)
    if scope == "from_here":
        query = query.filter(Event.start_time_utc >= event.start_time_utc)

    to_delete = query.all()
    count = len(to_delete)
    for e in to_delete:
        db.delete(e)
    db.commit()
    return {"deleted": count, "scope": scope}

@router.delete("/{event_id}/participants/{user_id}")
def remove_participant(event_id: int, user_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    _event, role = get_event_with_access(db, user, event_id)
    require_owner(role)

    p = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == user_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    db.delete(p)
    db.commit()
    return {"removed": True, "event_id": event_id, "user_id": user_id}