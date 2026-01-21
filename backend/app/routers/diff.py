from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.models.event_snapshot import EventSnapshot
from app.core.diff import diff_dicts

router = APIRouter(prefix="/events", tags=["diff"])

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

def iso(dt):
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.isoformat()

@router.get("/{event_id}/diff")
def event_diff(
    event_id: int,
    from_version: int,
    to_version: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    ensure_event_access(db, user, event_id)

    old = (
        db.query(EventSnapshot)
        .filter(EventSnapshot.event_id == event_id, EventSnapshot.version == from_version)
        .first()
    )
    new = (
        db.query(EventSnapshot)
        .filter(EventSnapshot.event_id == event_id, EventSnapshot.version == to_version)
        .first()
    )

    if not old or not new:
        raise HTTPException(status_code=404, detail="Snapshot version not found")

    old_dict = {
        "title": old.title,
        "description": old.description,
        "start_time_utc": iso(old.start_time_utc),
        "end_time_utc": iso(old.end_time_utc),
        "timezone": old.timezone,
        "reminder_minutes": old.reminder_minutes,
    }

    new_dict = {
        "title": new.title,
        "description": new.description,
        "start_time_utc": iso(new.start_time_utc),
        "end_time_utc": iso(new.end_time_utc),
        "timezone": new.timezone,
        "reminder_minutes": new.reminder_minutes,
    }

    return {
        "event_id": event_id,
        "from_version": from_version,
        "to_version": to_version,
        **diff_dicts(old_dict, new_dict),
    }
