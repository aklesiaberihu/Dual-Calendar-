from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time_utc: datetime
    end_time_utc: Optional[datetime] = None
    timezone: str = "UTC"
    reminder_minutes: int = 60

class EventCreate(EventBase):
    pass

class EventUpdate(BaseModel):
    version: int
    title: Optional[str] = None
    description: Optional[str] = None
    start_time_utc: Optional[datetime] = None
    end_time_utc: Optional[datetime] = None
    timezone: Optional[str] = None
    reminder_minutes: Optional[int] = None

class EventOut(EventBase):
    id: int
    user_id: int
    version: int

    class Config:
        from_attributes = True
