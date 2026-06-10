from datetime import datetime, timedelta
from typing import Optional

DEFAULT_DURATION_MINUTES = 60

def event_end_time(start: datetime, end: Optional[datetime]) -> datetime:
    
    if end is not None:
        return end
    return start + timedelta(minutes=DEFAULT_DURATION_MINUTES)

def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    
    return a_start < b_end and b_start < a_end
