from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.core.scheduling import overlaps, event_end_time

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
    """
    Return list of (user_id, email, role) including owner.
    """
    owner = db.query(User).filter(User.id == event.user_id).first()
    participants = [{
        "user_id": owner.id,
        "email": owner.email,
        "role": "owner"
    }]

    shared = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event.id)
        .all()
    )
    for p in shared:
        participants.append({
            "user_id": p.user_id,
            "email": p.user.email,
            "role": p.role
        })

    return participants

def events_user_can_see(db: Session, user_id: int):
    """
    Events a participant may have in their own calendar:
    - events they own
    - events shared with them
    """
    shared_ids = (
        db.query(EventParticipant.event_id)
        .filter(EventParticipant.user_id == user_id)
        .subquery()
    )
    return db.query(Event).filter((Event.user_id == user_id) | (Event.id.in_(shared_ids)))

@router.get("/{event_id}/conflicts")
def conflicts_for_participants(
    event_id: int,
    start_time_utc: datetime = Query(..., description="Proposed start time in UTC (ISO)"),
    end_time_utc: datetime = Query(..., description="Proposed end time in UTC (ISO)"),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    """
    Conflict-aware scheduling across participants:
    For the given event_id, check whether any participant has overlapping events
    in the proposed time window.

    Returns conflicts grouped by participant.
    """
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)

    if end_time_utc <= start_time_utc:
        raise HTTPException(status_code=400, detail="end_time_utc must be after start_time_utc")

    participants = get_event_participants(db, event)

    window_start = start_time_utc - timedelta(days=1)
    window_end = end_time_utc + timedelta(days=1)

    conflicts = []

    for p in participants:
        uid = p["user_id"]

        candidate_events = (
            events_user_can_see(db, uid)
            .filter(Event.start_time_utc >= window_start)
            .filter(Event.start_time_utc <= window_end)
            .all()
        )

        person_conflicts = []
        for ev in candidate_events:
            if ev.id == event_id:
                continue

            ev_start = ev.start_time_utc
            ev_end = event_end_time(ev_start, ev.end_time_utc)

            if overlaps(start_time_utc, end_time_utc, ev_start, ev_end):
                person_conflicts.append({
                    "event_id": ev.id,
                    "title": ev.title,
                    "start_time_utc": ev_start.isoformat(),
                    "end_time_utc": (ev.end_time_utc.isoformat() if ev.end_time_utc else None),
                    "owner_user_id": ev.user_id,
                })

        conflicts.append({
            "participant": p,
            "has_conflict": len(person_conflicts) > 0,
            "conflicting_events": person_conflicts,
        })

    return {
        "event_id": event_id,
        "proposed_start_time_utc": start_time_utc.isoformat(),
        "proposed_end_time_utc": end_time_utc.isoformat(),
        "conflicts": conflicts,
    }
