from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Set

Interval = Tuple[datetime, datetime]

def in_work_hours(slot_start: datetime, work_start_hour: int, work_end_hour: int) -> bool:
    """
    Work hours check in UTC (simple version for student project).
    Example: 9-17 means 09:00 <= start < 17:00.
    """
    h = slot_start.hour
    return work_start_hour <= h < work_end_hour

def slot_conflicts_for_user(busy_intervals: List[Interval], slot: Interval) -> bool:
    """
    True if slot overlaps with any busy interval.
    busy intervals must be merged already if possible (but works regardless).
    """
    s0, e0 = slot
    for s, e in busy_intervals:
        if s0 < e and s < e0:
            return True
    return False

def rank_slots(
    slots: List[Interval],
    busy_by_user: Dict[int, List[Interval]],
    required_users: Set[int],
    optional_users: Set[int],
    window_start: datetime,
    prefer_earlier: bool,
    work_start_hour: int,
    work_end_hour: int,
) -> List[dict]:
    """
    Returns ranked list of dicts:
    {start, end, score, reasons}
    Lower score = better.
    """
    ranked = []

    for slot in slots:
        s, e = slot
        reasons = []
        score = 0

        # Required users: must be free
        invalid = False
        for uid in required_users:
            if slot_conflicts_for_user(busy_by_user.get(uid, []), slot):
                invalid = True
                reasons.append(f"required user {uid} is busy")
        if invalid:
            continue

        # Optional users: prefer free
        for uid in optional_users:
            if slot_conflicts_for_user(busy_by_user.get(uid, []), slot):
                score += 100
                reasons.append(f"optional user {uid} is busy (+100)")

        # Work hours preference
        if not in_work_hours(s, work_start_hour, work_end_hour):
            score += 30
            reasons.append(f"outside work hours (+30)")

        # Prefer earlier preference
        if prefer_earlier:
            minutes_from_start = int((s - window_start).total_seconds() // 60)
            score += max(0, minutes_from_start // 10)  # small penalty per 10 min
            reasons.append(f"earlier preference penalty: +{max(0, minutes_from_start // 10)}")

        ranked.append({
            "start": s.isoformat(),
            "end": e.isoformat(),
            "score": score,
            "reasons": reasons if reasons else ["ideal slot (no penalties)"]
        })

    ranked.sort(key=lambda x: x["score"])
    return ranked
