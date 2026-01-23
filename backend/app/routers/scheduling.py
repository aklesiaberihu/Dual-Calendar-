from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Tuple

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.core.scheduling import overlaps, event_end_time
from app.core.intervals import merge_intervals, find_gaps, choose_slots

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
    shared_ids = (
        db.query(EventParticipant.event_id)
        .filter(EventParticipant.user_id == user_id)
        .subquery()
    )
    return db.query(Event).filter((Event.user_id == user_id) | (Event.id.in_(shared_ids)))

def busy_intervals_for_user(db: Session, user_id: int, window_start: datetime, window_end: datetime, exclude_event_id: int):
    """
    Return list of busy intervals (start, end) for all events user can see in window.
    """
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

    return intervals

@router.get("/{event_id}/conflicts")
def conflicts_for_participants(
    event_id: int,
    start_time_utc: datetime = Query(...),
    end_time_utc: datetime = Query(...),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)

    if end_time_utc <= start_time_utc:
        raise HTTPException(status_code=400, detail="end_time_utc must be after start_time_utc")

    participants = get_event_participants(db, event)
    conflicts = []

    for p in participants:
        uid = p["user_id"]
        intervals = busy_intervals_for_user(db, uid, start_time_utc, end_time_utc, exclude_event_id=event_id)

        person_conflicts = []
        for s, e in intervals:
            if overlaps(start_time_utc, end_time_utc, s, e):
                person_conflicts.append({
                    "busy_start_utc": s.isoformat(),
                    "busy_end_utc": e.isoformat()
                })

        conflicts.append({
            "participant": p,
            "has_conflict": len(person_conflicts) > 0,
            "conflicts": person_conflicts,
        })

    return {
        "event_id": event_id,
        "proposed_start_time_utc": start_time_utc.isoformat(),
        "proposed_end_time_utc": end_time_utc.isoformat(),
        "conflicts": conflicts,
    }

@router.get("/{event_id}/suggest")
def suggest_time_slots(
    event_id: int,
    duration_minutes: int = Query(..., ge=1, le=24*60),
    window_start_utc: datetime = Query(...),
    window_end_utc: datetime = Query(...),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    """
    Automatic time slot suggestion across participants.
    """
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)

    if window_end_utc <= window_start_utc:
        raise HTTPException(status_code=400, detail="window_end_utc must be after window_start_utc")

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
        "participants": participants,
        "duration_minutes": duration_minutes,
        "window_start_utc": window_start_utc.isoformat(),
        "window_end_utc": window_end_utc.isoformat(),
        "busy_merged": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in merged_busy],
        "suggested_slots": [{"start": s.isoformat(), "end": e.isoformat()} for s, e in slots],
    }
