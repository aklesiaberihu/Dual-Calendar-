from datetime import datetime, timedelta, time
from typing import List, Tuple
from sqlalchemy.orm import Session, Query

Interval = Tuple[datetime, datetime]


def normalize(intervals: List[Interval]) -> List[Interval]:
    cleaned = [(s, e) for (s, e) in intervals if s is not None and e is not None and e > s]
    cleaned.sort(key=lambda x: x[0])
    return cleaned


def merge_intervals(intervals: List[Interval]) -> List[Interval]:
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


def events_user_can_see(db: Session, user_id: int) -> Query:
    from app.models.event import Event
    from app.models.event_participant import EventParticipant
    shared_ids = (
        db.query(EventParticipant.event_id)
        .filter(EventParticipant.user_id == user_id)
        .scalar_subquery()
    )
    return db.query(Event).filter((Event.user_id == user_id) | (Event.id.in_(shared_ids)))


def holiday_intervals(db: Session, window_start: datetime, window_end: datetime) -> List[Interval]:
    from app.models.holiday import Holiday
    start_date = window_start.date()
    end_date = window_end.date()
    holidays = (
        db.query(Holiday)
        .filter(Holiday.resolved_date >= start_date, Holiday.resolved_date <= end_date)
        .all()
    )
    intervals: List[Interval] = []
    for h in holidays:
        s = datetime.combine(h.resolved_date, time.min)
        e = s + timedelta(days=1)
        if e <= window_start or s >= window_end:
            continue
        intervals.append((s, e))
    return intervals


def busy_intervals_for_user(
    db: Session,
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    exclude_event_id: int,
) -> List[Interval]:
    from app.models.event import Event
    from app.core.scheduling import event_end_time
    w0 = window_start - timedelta(days=1)
    w1 = window_end + timedelta(days=1)
    candidate_events = (
        events_user_can_see(db, user_id)
        .filter(Event.start_time_utc >= w0, Event.start_time_utc <= w1)
        .all()
    )
    intervals: List[Interval] = []
    for ev in candidate_events:
        if ev.id == exclude_event_id:
            continue
        s = ev.start_time_utc
        e = event_end_time(s, ev.end_time_utc)
        if e <= window_start or s >= window_end:
            continue
        intervals.append((s, e))
    intervals.extend(holiday_intervals(db, window_start, window_end))
    return intervals


def collect_busy_by_participants(
    db: Session,
    participant_ids: List[int],
    window_start: datetime,
    window_end: datetime,
    exclude_event_id: int,
) -> Tuple[dict, List[Interval]]:
    busy_by_user: dict = {}
    all_busy: List[Interval] = []
    for uid in participant_ids:
        intervals = busy_intervals_for_user(db, uid, window_start, window_end, exclude_event_id)
        busy_by_user[uid] = merge_intervals(intervals)
        all_busy.extend(busy_by_user[uid])
    return busy_by_user, all_busy
