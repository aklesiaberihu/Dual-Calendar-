import calendar as cal_module
from datetime import datetime, timedelta, date
from typing import Optional

MAX_OCCURRENCES = 500

WEEKDAY_MAP = {"MON": 0, "TUE": 1, "WED": 2, "THU": 3, "FRI": 4, "SAT": 5, "SUN": 6}
WEEKDAY_REVERSE = {v: k for k, v in WEEKDAY_MAP.items()}

def expand_occurrences(
    frequency: str,
    interval: int,
    byday: list,
    end_type: str,
    end_count: int,
    end_until: Optional[date],
    base_start: datetime,
    duration: Optional[timedelta],
) -> list:
    
    interval = max(1, interval)
    results = []

    if frequency == "daily":
        current = base_start
        while len(results) < MAX_OCCURRENCES:
            if end_type == "until" and current.date() > end_until:
                break
            results.append((current, current + duration if duration else None))
            if end_type == "count" and len(results) >= end_count:
                break
            current += timedelta(days=interval)

    elif frequency == "weekly":

        if not byday:
            byday = [WEEKDAY_REVERSE[base_start.weekday()]]

        sorted_wds = sorted(WEEKDAY_MAP[d] for d in byday)
        time_offset = timedelta(
            hours=base_start.hour,
            minutes=base_start.minute,
            seconds=base_start.second,
        )

        week_start = (
            base_start.replace(hour=0, minute=0, second=0, microsecond=0)
            - timedelta(days=base_start.weekday())
        )

        stop = False
        while not stop and len(results) < MAX_OCCURRENCES:
            for wd in sorted_wds:
                if len(results) >= MAX_OCCURRENCES:
                    stop = True
                    break
                candidate = week_start + timedelta(days=wd) + time_offset
                if candidate < base_start:
                    continue
                if end_type == "until" and candidate.date() > end_until:
                    stop = True
                    break
                results.append((candidate, candidate + duration if duration else None))
                if end_type == "count" and len(results) >= end_count:
                    stop = True
                    break
            if not stop:
                week_start += timedelta(weeks=interval)

    elif frequency == "monthly":
        target_day = base_start.day
        cur_year = base_start.year
        cur_month = base_start.month

        while len(results) < MAX_OCCURRENCES:

            last_day = cal_module.monthrange(cur_year, cur_month)[1]
            actual_day = min(target_day, last_day)
            candidate = base_start.replace(year=cur_year, month=cur_month, day=actual_day)

            if end_type == "until" and candidate.date() > end_until:
                break
            results.append((candidate, candidate + duration if duration else None))
            if end_type == "count" and len(results) >= end_count:
                break

            m = cur_month - 1 + interval
            cur_year += m // 12
            cur_month = m % 12 + 1

    return results

def detect_series_conflicts(occurrences: list, db, user_id: int) -> list:
    
    from sqlalchemy import and_, or_
    from app.models.event import Event

    conflicts = []
    for start, end in occurrences:
        if end is None:
            continue

        overlapping = (
            db.query(Event)
            .filter(
                Event.user_id == user_id,
                or_(

                    and_(
                        Event.end_time_utc.isnot(None),
                        Event.start_time_utc < end,
                        Event.end_time_utc > start,
                    ),

                    and_(
                        Event.end_time_utc.is_(None),
                        Event.start_time_utc >= start,
                        Event.start_time_utc < end,
                    ),
                ),
            )
            .all()
        )

        if overlapping:
            conflicts.append({
                "occurrence_start": start.isoformat(),
                "conflicting": [{"id": e.id, "title": e.title} for e in overlapping],
            })

    return conflicts
