from datetime import datetime, timedelta
from typing import Optional

DEFAULT_DURATION_MINUTES = 60

def event_end_time(start: datetime, end: Optional[datetime]) -> datetime:
    """
    If end_time_utc is missing, treat event as DEFAULT_DURATION_MINUTES.
    This keeps conflict detection stable even if some events have no end.
    """
    if end is not None:
        return end
    return start + timedelta(minutes=DEFAULT_DURATION_MINUTES)

def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """
    True if intervals overlap: [a_start, a_end) intersects [b_start, b_end)
    """
    return a_start < b_end and b_start < a_end
