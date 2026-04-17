from datetime import datetime, timedelta
from typing import List, Tuple

Interval = Tuple[datetime, datetime]

def normalize(intervals: List[Interval]) -> List[Interval]:
    """
    Remove invalid intervals and sort.
    """
    cleaned = [(s, e) for (s, e) in intervals if s is not None and e is not None and e > s]
    cleaned.sort(key=lambda x: x[0])
    return cleaned

def merge_intervals(intervals: List[Interval]) -> List[Interval]:
    """
    Merge overlapping or touching intervals.
    Example: [10:00-11:00] + [10:30-12:00] => [10:00-12:00]
             [10:00-11:00] + [11:00-11:30] => [10:00-11:30]
    """
    intervals = normalize(intervals)
    if not intervals:
        return []

    merged = [intervals[0]]
    for s, e in intervals[1:]:
        last_s, last_e = merged[-1]
        if s <= last_e:
            merged[-1] = (last_s, max(last_e, e))
        else:
            merged.append((s, e))
    return merged

def find_gaps(window_start: datetime, window_end: datetime, busy: List[Interval]) -> List[Interval]:
    """
    Given a window and merged busy intervals, return free gaps inside the window.
    """
    busy = merge_intervals(busy)

    gaps: List[Interval] = []
    cursor = window_start

    for s, e in busy:
        if e <= window_start:
            continue
        if s >= window_end:
            break

        s_clamped = max(s, window_start)
        e_clamped = min(e, window_end)

        if s_clamped > cursor:
            gaps.append((cursor, s_clamped))
        cursor = max(cursor, e_clamped)

    if cursor < window_end:
        gaps.append((cursor, window_end))

    return gaps

def choose_slots(gaps: List[Interval], duration_minutes: int, limit: int) -> List[Interval]:
    """
    From gaps, generate earliest non-overlapping slots of the given duration,
    up to the requested limit.
    """
    duration = timedelta(minutes=duration_minutes)
    slots: List[Interval] = []

    for s, e in gaps:
        cursor = s

        while cursor + duration <= e:
            slots.append((cursor, cursor + duration))
            if len(slots) >= limit:
                return slots
            cursor += duration

    return slots