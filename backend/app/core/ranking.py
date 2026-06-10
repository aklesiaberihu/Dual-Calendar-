import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Set
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

Interval = Tuple[datetime, datetime]

def in_work_hours(slot_start: datetime, work_start_hour: int, work_end_hour: int, tz_name: str = "UTC") -> bool:
    
    if tz_name and tz_name != "UTC":
        local = slot_start.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo(tz_name))
        h = local.hour
    else:
        h = slot_start.hour
    return work_start_hour <= h < work_end_hour

def slot_conflicts_for_user(busy_intervals: List[Interval], slot: Interval) -> bool:
    
    s0, e0 = slot
    for s, e in busy_intervals:
        if s0 < e and s < e0:
            return True
    return False

def score_to_rating(score: int) -> str:
    
    if score <= 50:
        return "⭐⭐⭐⭐⭐ IDEAL"
    elif score <= 150:
        return "⭐⭐⭐⭐ EXCELLENT"
    elif score <= 250:
        return "⭐⭐⭐ GOOD"
    elif score <= 350:
        return "⭐⭐ FAIR"
    else:
        return "⭐ POOR"

def rank_slots(
    slots: List[Interval],
    busy_by_user: Dict[int, List[Interval]],
    required_users: Set[int],
    optional_users: Set[int],
    work_start_hour: int,
    work_end_hour: int,
    tz_name: str = "UTC",
) -> List[dict]:
    
    logger.debug("Ranking slots: required_users=%s, optional_users=%s", required_users, optional_users)
    logger.debug("busy_by_user keys: %s", list(busy_by_user.keys()))

    ranked = []

    for slot in slots:
        s, e = slot
        reasons = []
        score = 0
        optional_conflicts = 0

        invalid = False
        for uid in required_users:
            busy_intervals = busy_by_user.get(uid, [])
            if slot_conflicts_for_user(busy_intervals, slot):
                logger.debug(f"EXCLUDED: Slot {s}-{e}: Required user {uid} is busy")
                invalid = True
                break

        if invalid:
            continue

        for uid in optional_users:
            if slot_conflicts_for_user(busy_by_user.get(uid, []), slot):
                optional_conflicts += 1
                score += 100

        if optional_conflicts > 0:
            reasons.append(f"{optional_conflicts} optional participant(s) have conflicts")

        if not in_work_hours(s, work_start_hour, work_end_hour, tz_name):
            score += 50
            reasons.append("Outside standard work hours (9-17)")

        if not reasons:
            reasons = ["Everyone free, within work hours"]

        ranking = score_to_rating(score)

        ranked.append({
            "start": s,
            "end": e,
            "score": score,
            "rating": ranking,
            "reasons": reasons
        })

    ranked.sort(key=lambda x: x["score"])
    return ranked
