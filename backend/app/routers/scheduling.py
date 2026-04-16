from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, time
from typing import List, Tuple, Set
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.models.holiday import Holiday
from app.core.scheduling import overlaps, event_end_time
from app.core.intervals import merge_intervals, find_gaps, choose_slots
from app.core.ranking import rank_slots

router = APIRouter(prefix="/events", tags=["scheduling"])


def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def ensure_event_access(db: Session, user: User, event_id: int):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.user_id == user.id:
        return event

    participant = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == user.id)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="No access to this event")

    return event


def get_event_participants(db: Session, event: Event):
    owner = db.query(User).filter(User.id == event.user_id).first()
    participants = [{
        "user_id": owner.id,
        "email": owner.email,
        "role": "owner"
    }]

    shared = db.query(EventParticipant).filter(EventParticipant.event_id == event.id).all()
    for p in shared:
        participants.append({
            "user_id": p.user_id,
            "email": p.user.email,
            "role": p.role
        })

    return participants


def events_user_can_see(db: Session, user_id: int):
    # Fixed: use scalar_subquery() instead of subquery() for .in_() compatibility
    shared_ids = (
        db.query(EventParticipant.event_id)
        .filter(EventParticipant.user_id == user_id)
        .scalar_subquery()
    )
    return db.query(Event).filter((Event.user_id == user_id) | (Event.id.in_(shared_ids)))


def holiday_intervals(db: Session, window_start: datetime, window_end: datetime) -> List[Tuple[datetime, datetime]]:
    start_date = window_start.date()
    end_date = window_end.date()

    holidays = (
        db.query(Holiday)
        .filter(Holiday.resolved_date >= start_date)
        .filter(Holiday.resolved_date <= end_date)
        .all()
    )

    intervals: List[Tuple[datetime, datetime]] = []
    for h in holidays:
        s = datetime.combine(h.resolved_date, time.min)
        e = s + timedelta(days=1)

        if e <= window_start or s >= window_end:
            continue

        intervals.append((s, e))

    return intervals


def busy_intervals_for_user(
    db: Session,
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    exclude_event_id: int,
):
    w0 = window_start - timedelta(days=1)
    w1 = window_end + timedelta(days=1)

    candidate_events = (
        events_user_can_see(db, user_id)
        .filter(Event.start_time_utc >= w0)
        .filter(Event.start_time_utc <= w1)
        .all()
    )

    intervals: List[Tuple[datetime, datetime]] = []
    for ev in candidate_events:
        if ev.id == exclude_event_id:
            continue
        s = ev.start_time_utc
        e = event_end_time(s, ev.end_time_utc)
        if e <= window_start or s >= window_end:
            continue
        intervals.append((s, e))

    # Treat holidays as all-day busy intervals for everyone
    intervals.extend(holiday_intervals(db, window_start, window_end))

    return intervals


def parse_ids(csv: str) -> Set[int]:
    if not csv:
        return set()
    out = set()
    for p in csv.split(","):
        p = p.strip()
        if p:
            try:
                out.add(int(p))
            except ValueError:
                pass
    return out


def resolve_timezone(display_timezone: str | None, event: Event) -> str:
    tz_name = display_timezone or event.timezone or "UTC"
    try:
        ZoneInfo(tz_name)
        return tz_name
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {tz_name}")


def as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(ZoneInfo("UTC"))


def format_dt_pair(dt: datetime, tz_name: str):
    utc_dt = as_utc(dt)
    local_dt = utc_dt.astimezone(ZoneInfo(tz_name))
    return {
        "utc": utc_dt.isoformat(),
        "local": local_dt.isoformat(),
    }


def format_interval(start: datetime, end: datetime, tz_name: str):
    return {
        "start_utc": as_utc(start).isoformat(),
        "end_utc": as_utc(end).isoformat(),
        "start_local": as_utc(start).astimezone(ZoneInfo(tz_name)).isoformat(),
        "end_local": as_utc(end).astimezone(ZoneInfo(tz_name)).isoformat(),
    }


@router.get("/{event_id}/conflicts")
def conflicts_for_participants(
    event_id: int,
    start_time_utc: datetime = Query(...),
    end_time_utc: datetime = Query(...),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)

    if end_time_utc <= start_time_utc:
        raise HTTPException(status_code=400, detail="end_time_utc must be after start_time_utc")

    tz_name = resolve_timezone(display_timezone, event)
    participants = get_event_participants(db, event)
    conflicts = []

    for p in participants:
        uid = p["user_id"]
        intervals = busy_intervals_for_user(db, uid, start_time_utc, end_time_utc, exclude_event_id=event_id)

        person_conflicts = []
        for s, e in intervals:
            if overlaps(start_time_utc, end_time_utc, s, e):
                person_conflicts.append(format_interval(s, e, tz_name))

        conflicts.append({
            "participant": p,
            "has_conflict": len(person_conflicts) > 0,
            "conflicts": person_conflicts,
        })

    return {
        "event_id": event_id,
        "display_timezone": tz_name,
        "proposed_start_time": format_dt_pair(start_time_utc, tz_name),
        "proposed_end_time": format_dt_pair(end_time_utc, tz_name),
        "conflicts": conflicts,
    }


@router.get("/{event_id}/suggest")
def suggest_time_slots(
    event_id: int,
    duration_minutes: int = Query(..., ge=1, le=24*60),
    window_start_utc: datetime = Query(...),
    window_end_utc: datetime = Query(...),
    limit: int = Query(5, ge=1, le=50),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)

    if window_end_utc <= window_start_utc:
        raise HTTPException(status_code=400, detail="window_end_utc must be after window_start_utc")

    tz_name = resolve_timezone(display_timezone, event)
    participants = get_event_participants(db, event)

    all_busy: List[Tuple[datetime, datetime]] = []
    for p in participants:
        all_busy.extend(
            busy_intervals_for_user(db, p["user_id"], window_start_utc, window_end_utc, exclude_event_id=event_id)
        )

    merged_busy = merge_intervals(all_busy)
    gaps = find_gaps(window_start_utc, window_end_utc, merged_busy)
    slots = choose_slots(gaps, duration_minutes=duration_minutes, limit=limit)

    return {
        "event_id": event_id,
        "display_timezone": tz_name,
        "participants": participants,
        "duration_minutes": duration_minutes,
        "window_start": format_dt_pair(window_start_utc, tz_name),
        "window_end": format_dt_pair(window_end_utc, tz_name),
        "busy_merged": [format_interval(s, e, tz_name) for s, e in merged_busy],
        "suggested_slots": [format_interval(s, e, tz_name) for s, e in slots],
    }


@router.get("/{event_id}/rank")
def rank_time_slots(
    event_id: int,
    duration_minutes: int = Query(..., ge=1, le=24*60),
    window_start_utc: datetime = Query(...),
    window_end_utc: datetime = Query(...),
    candidate_limit: int = Query(20, ge=1, le=100),
    max_results: int = Query(5, ge=1, le=20),
    required_user_ids: str = Query("", description="comma-separated user ids"),
    optional_user_ids: str = Query("", description="comma-separated user ids"),
    prefer_earlier: bool = Query(True),
    work_start_hour: int = Query(9, ge=0, le=23),
    work_end_hour: int = Query(17, ge=1, le=24),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    """
    Constraint-based ranking:
    - Generate candidate slots across the search window
    - Filter by required attendees (hard constraint — if they're busy, slot is excluded)
    - Score remaining slots by: optional conflicts + outside work hours + earlier preference
    - Return top ranked slots
    """
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)

    if window_end_utc <= window_start_utc:
        raise HTTPException(status_code=400, detail="window_end_utc must be after window_start_utc")

    tz_name = resolve_timezone(display_timezone, event)
    participants = get_event_participants(db, event)

    # Build busy intervals per user
    all_busy: List[Tuple[datetime, datetime]] = []
    busy_by_user = {}
    for p in participants:
        uid = p["user_id"]
        intervals = busy_intervals_for_user(db, uid, window_start_utc, window_end_utc, exclude_event_id=event_id)
        busy_by_user[uid] = merge_intervals(intervals)
        all_busy.extend(busy_by_user[uid])

    # Find free slots: merge all busy, find gaps, generate candidates
    merged_busy = merge_intervals(all_busy)
    gaps = find_gaps(window_start_utc, window_end_utc, merged_busy)
    candidates = choose_slots(gaps, duration_minutes=duration_minutes, limit=candidate_limit)

    # Parse required / optional user ID sets
    required = parse_ids(required_user_ids)
    optional = parse_ids(optional_user_ids)

    # If no explicit required/optional provided, treat ALL participants as required
    # This ensures the ranking actually enforces everyone's availability
    if not required and not optional:
        required = {p["user_id"] for p in participants}

    ranked = rank_slots(
        slots=candidates,
        busy_by_user=busy_by_user,
        required_users=required,
        optional_users=optional,
        window_start=window_start_utc,
        prefer_earlier=prefer_earlier,
        work_start_hour=work_start_hour,
        work_end_hour=work_end_hour,
    )

    ranked_with_local = []
    for item in ranked[:max_results]:
        ranked_with_local.append({
            **item,
            "start_utc": as_utc(item["start"]).isoformat() if isinstance(item.get("start"), datetime) else item.get("start"),
            "end_utc": as_utc(item["end"]).isoformat() if isinstance(item.get("end"), datetime) else item.get("end"),
            "start_local": as_utc(item["start"]).astimezone(ZoneInfo(tz_name)).isoformat() if isinstance(item.get("start"), datetime) else item.get("start"),
            "end_local": as_utc(item["end"]).astimezone(ZoneInfo(tz_name)).isoformat() if isinstance(item.get("end"), datetime) else item.get("end"),
        })

    return {
        "event_id": event_id,
        "display_timezone": tz_name,
        "participants": participants,
        "duration_minutes": duration_minutes,
        "window_start": format_dt_pair(window_start_utc, tz_name),
        "window_end": format_dt_pair(window_end_utc, tz_name),
        "constraints": {
            "required_user_ids": sorted(list(required)),
            "optional_user_ids": sorted(list(optional)),
            "prefer_earlier": prefer_earlier,
            "work_start_hour": work_start_hour,
            "work_end_hour": work_end_hour,
        },
        "candidate_slots": [format_interval(s, e, tz_name) for s, e in candidates],
        "ranked_slots": ranked_with_local,
    }