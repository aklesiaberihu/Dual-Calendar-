from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.schemas.event import EventCreate, EventUpdate, EventOut

router = APIRouter(prefix="/events", tags=["events"])

def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

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
    )

    db.add(event)
    db.commit()
    db.refresh(event)
    return event

@router.get("", response_model=list[EventOut])
def list_events(db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    events = db.query(Event).filter(Event.user_id == user.id).order_by(Event.start_time_utc.asc()).all()
    return events

@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == user.id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event

@router.put("/{event_id}", response_model=EventOut)
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == user.id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(event, k, v)

    db.commit()
    db.refresh(event)
    return event

@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = get_current_user(db, email)
    event = db.query(Event).filter(Event.id == event_id, Event.user_id == user.id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    db.delete(event)
    db.commit()
    return {"deleted": True, "event_id": event_id}
