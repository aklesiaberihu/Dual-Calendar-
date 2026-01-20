from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.models.event_snapshot import EventSnapshot
from app.models.event_participant import EventParticipant
from app.schemas.event import EventCreate, EventUpdate, EventOut
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

def get_event_with_access(db: Session, user: User, event_id: int):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    # Owner always has full access
    if event.user_id == user.id:
        return event, "owner"

    # Otherwise check participant role
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

@router.post("", response_model=EventOut)
def create_event(payload: EventCreate, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)

    event = Event(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        start_time_utc=payload.start_time_utc,
        end_time_utc=payload.end_time_utc,
        timezone=payload.timezone,
        reminder_minutes=payload.reminder_minutes,
        version=1,
    )

    db.add(event)
    db.commit()
    db.refresh(event)

    # snapshot version 1
    snapshot_event(db, event)
    db.commit()
    db.refresh(event)

    return event

@router.get("", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)

    # Owned events OR events where user is a participant
    participant_event_ids = (
        db.query(EventParticipant.event_id)
        .filter(EventParticipant.user_id == user.id)
        .subquery()
    )

    events = (
        db.query(Event)
        .filter(or_(Event.user_id == user.id, Event.id.in_(participant_event_ids)))
        .order_by(Event.start_time_utc.asc())
        .all()
    )
    return events

@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)
    return event

@router.put("/{event_id}", response_model=EventOut)
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_editor_or_owner(role)

    # optimistic lock check
    if payload.version != event.version:
        raise HTTPException(
            status_code=409,
            detail=f"Version conflict. Current version is {event.version}, you sent {payload.version}."
        )

    updates = payload.model_dump(exclude_unset=True)
    updates.pop("version", None)

    for k, v in updates.items():
        setattr(event, k, v)

    event.version += 1

    db.commit()
    db.refresh(event)

    snapshot_event(db, event)
    db.commit()
    db.refresh(event)

    return event

@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)

    db.delete(event)
    db.commit()
    return {"deleted": True, "event_id": event_id}

# -------- Sharing endpoints --------

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

    # Return owner + participants
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
