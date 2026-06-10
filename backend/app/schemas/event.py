from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class EventBase(BaseModel):
    title: str
    description: Optional[str] = None
    timezone: str = "UTC"
    reminder_minutes: int = 60

class EventCreate(EventBase):
    start_time_local: datetime
    end_time_local: Optional[datetime] = None

    recurrence_rule: str = "none"
    recurrence_count: int = 1

    recurrence_interval: int = 1
    recurrence_byday: Optional[str] = None
    recurrence_end_type: Optional[str] = None
    recurrence_end_count: Optional[int] = None
    recurrence_end_until: Optional[str] = None

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
    recurrence_group_id: Optional[str] = None
    recurrence_rule: Optional[str] = None
    recurrence_interval: Optional[int] = None
    recurrence_byday: Optional[str] = None

    class Config:
        from_attributes = True
