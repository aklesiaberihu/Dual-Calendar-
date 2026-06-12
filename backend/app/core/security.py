import os
from datetime import datetime, timedelta
from typing import Tuple

from fastapi import HTTPException
from passlib.context import CryptContext
from jose import jwt
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": subject, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_event_with_access(db: Session, user: User, event_id: int) -> Tuple[Event, str]:
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


def require_editor_or_owner(role: str) -> None:
    if role not in ("owner", "editor"):
        raise HTTPException(status_code=403, detail="You do not have permission to modify this event")


def require_owner(role: str) -> None:
    if role != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can perform this action")
