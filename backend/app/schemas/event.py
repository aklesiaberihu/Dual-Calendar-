from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime

RecurrenceRule = Literal["none", "daily", "weekly"]


class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    timezone: str = "UTC"
    reminder_minutes: int = 60


class EventCreate(EventBase):
    start_time_local: datetime
    end_time_local: Optional[datetime] = None
    recurrence_rule: RecurrenceRule = "none"
    recurrence_count: int = 1


class EventUpdate(BaseModel):
    version: int
    title: Optional[str] = None
    description: Optional[str] = None
    start_time_local: Optional[datetime] = None
    end_time_local: Optional[datetime] = None
    timezone: Optional[str] = None
    reminder_minutes: Optional[int] = None


class EventOut(BaseModel):
    id: int
    user_id: int
    version: int
    title: str
    description: Optional[str] = None
    start_time_utc: datetime
    end_time_utc: Optional[datetime] = None
    start_time_local: Optional[datetime] = None
    end_time_local: Optional[datetime] = None
    timezone: str = "UTC"
    reminder_minutes: int = 60

    class Config:
        from_attributes = True