from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Tuple, Set
from zoneinfo import ZoneInfo

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.core.scheduling import overlaps
from app.core.intervals import (
    merge_intervals, find_gaps, choose_slots,
    busy_intervals_for_user, collect_busy_by_participants,
)
from app.core.ranking import rank_slots

router = APIRouter(prefix="/events", tags=["scheduling"])
schedule_router = APIRouter(prefix="/schedule", tags=["scheduling"])


def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def ensure_event_access(db: Session, user: User, event_id: int) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.user_id == user.id:
        return event
    participant = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == user.id)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="No access to this event")
    return event


def get_event_participants(db: Session, event: Event) -> list:
    owner = db.query(User).filter(User.id == event.user_id).first()
    participants = [{"user_id": owner.id, "email": owner.email, "role": "owner"}]
    for p in db.query(EventParticipant).filter(EventParticipant.event_id == event.id).all():
        participants.append({"user_id": p.user_id, "email": p.user.email, "role": p.role})
    return participants


def resolve_timezone(display_timezone: str | None, event: Event) -> str:
    tz_name = display_timezone or event.timezone or "UTC"
    try:
        ZoneInfo(tz_name)
        return tz_name
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {tz_name}")


def as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(ZoneInfo("UTC"))


def to_naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def format_dt_pair(dt: datetime, tz_name: str) -> dict:
    utc_dt = as_utc(dt)
    return {"utc": utc_dt.isoformat(), "local": utc_dt.astimezone(ZoneInfo(tz_name)).isoformat()}


def format_interval(start: datetime, end: datetime, tz_name: str) -> dict:
    return {
        "start_utc": as_utc(start).isoformat(),
        "end_utc": as_utc(end).isoformat(),
        "start_local": as_utc(start).astimezone(ZoneInfo(tz_name)).isoformat(),
        "end_local": as_utc(end).astimezone(ZoneInfo(tz_name)).isoformat(),
    }


def build_conflicts_detected(participants_info: list, busy_by_user: dict, tz_name: str) -> list:
    return [
        {"email": p["email"], "busy_intervals": [format_interval(s, e, tz_name) for s, e in busy_by_user.get(p["user_id"], [])]}
        for p in participants_info if busy_by_user.get(p["user_id"])
    ]


def format_ranked_slots(ranked: list, max_results: int, tz_name: str) -> list:
    result = []
    for item in ranked[:max_results]:
        s_utc = as_utc(item["start"])
        e_utc = as_utc(item["end"])
        result.append({
            **item,
            "start": s_utc.isoformat(),
            "end": e_utc.isoformat(),
            "start_utc": s_utc.isoformat(),
            "end_utc": e_utc.isoformat(),
            "start_local": s_utc.astimezone(ZoneInfo(tz_name)).isoformat(),
            "end_local": e_utc.astimezone(ZoneInfo(tz_name)).isoformat(),
        })
    return result


@router.get("/{event_id}/conflicts")
def conflicts_for_participants(
    event_id: int,
    start_time_utc: datetime = Query(...),
    end_time_utc: datetime = Query(...),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)
    if end_time_utc <= start_time_utc:
        raise HTTPException(status_code=400, detail="end_time_utc must be after start_time_utc")
    tz_name = resolve_timezone(display_timezone, event)
    participants = get_event_participants(db, event)
    conflicts = []
    for p in participants:
        intervals = busy_intervals_for_user(db, p["user_id"], start_time_utc, end_time_utc, exclude_event_id=event_id)
        person_conflicts = [format_interval(s, e, tz_name) for s, e in intervals if overlaps(start_time_utc, end_time_utc, s, e)]
        conflicts.append({"participant": p, "has_conflict": bool(person_conflicts), "conflicts": person_conflicts})
    return {
        "event_id": event_id,
        "display_timezone": tz_name,
        "proposed_start_time": format_dt_pair(start_time_utc, tz_name),
        "proposed_end_time": format_dt_pair(end_time_utc, tz_name),
        "conflicts": conflicts,
    }


@router.get("/{event_id}/suggest")
def suggest_time_slots(
    event_id: int,
    duration_minutes: int = Query(..., ge=1, le=24*60),
    window_start_utc: datetime = Query(...),
    window_end_utc: datetime = Query(...),
    limit: int = Query(5, ge=1, le=50),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)
    if window_end_utc <= window_start_utc:
        raise HTTPException(status_code=400, detail="window_end_utc must be after window_start_utc")
    tz_name = resolve_timezone(display_timezone, event)
    participants = get_event_participants(db, event)
    participant_ids = [p["user_id"] for p in participants]
    _, all_busy = collect_busy_by_participants(db, participant_ids, window_start_utc, window_end_utc, event_id)
    gaps = find_gaps(window_start_utc, window_end_utc, merge_intervals(all_busy))
    slots = choose_slots(gaps, duration_minutes=duration_minutes, limit=limit)
    return {
        "event_id": event_id,
        "display_timezone": tz_name,
        "participants": participants,
        "duration_minutes": duration_minutes,
        "window_start": format_dt_pair(window_start_utc, tz_name),
        "window_end": format_dt_pair(window_end_utc, tz_name),
        "busy_merged": [format_interval(s, e, tz_name) for s, e in merge_intervals(all_busy)],
        "suggested_slots": [format_interval(s, e, tz_name) for s, e in slots],
    }


@router.get("/{event_id}/rank")
def rank_time_slots(
    event_id: int,
    duration_minutes: int = Query(..., ge=1, le=24*60),
    window_start_utc: datetime = Query(...),
    window_end_utc: datetime = Query(...),
    candidate_limit: int = Query(20, ge=1, le=100),
    max_results: int = Query(5, ge=1, le=20),
    work_start_hour: int = Query(9, ge=0, le=23),
    work_end_hour: int = Query(17, ge=1, le=24),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    caller = get_current_user(db, email)
    event = ensure_event_access(db, caller, event_id)
    ws, we = to_naive_utc(window_start_utc), to_naive_utc(window_end_utc)
    if we <= ws:
        raise HTTPException(status_code=400, detail="window_end_utc must be after window_start_utc")
    tz_name = resolve_timezone(display_timezone, event)
    participants = get_event_participants(db, event)
    participant_ids = [p["user_id"] for p in participants]
    busy_by_user, all_busy = collect_busy_by_participants(db, participant_ids, ws, we, event_id)
    gaps = find_gaps(ws, we, merge_intervals(all_busy))
    candidates = choose_slots(gaps, duration_minutes=duration_minutes, limit=candidate_limit)
    required = {p["user_id"] for p in participants}
    ranked = rank_slots(
        slots=candidates, busy_by_user=busy_by_user, required_users=required,
        optional_users=set(), work_start_hour=work_start_hour, work_end_hour=work_end_hour, tz_name=tz_name,
    )
    return {
        "event_id": event_id, "display_timezone": tz_name, "participants": participants,
        "duration_minutes": duration_minutes,
        "window_start": format_dt_pair(ws, tz_name), "window_end": format_dt_pair(we, tz_name),
        "constraints": {"required_user_ids": sorted(required), "optional_user_ids": [],
                        "work_start_hour": work_start_hour, "work_end_hour": work_end_hour},
        "candidate_slots": [format_interval(s, e, tz_name) for s, e in candidates],
        "ranked_slots": format_ranked_slots(ranked, max_results, tz_name),
        "conflicts_detected": build_conflicts_detected(participants, busy_by_user, tz_name),
    }


@schedule_router.get("/rank")
def rank_slots_no_event(
    participant_emails: str = Query(""),
    duration_minutes: int = Query(..., ge=1, le=24*60),
    window_start_utc: datetime = Query(...),
    window_end_utc: datetime = Query(...),
    candidate_limit: int = Query(20, ge=1, le=100),
    max_results: int = Query(5, ge=1, le=20),
    work_start_hour: int = Query(9, ge=0, le=23),
    work_end_hour: int = Query(17, ge=1, le=24),
    display_timezone: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    organizer = get_current_user(db, email)
    tz_name = display_timezone or "UTC"
    try:
        ZoneInfo(tz_name)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid timezone: {tz_name}")
    ws, we = to_naive_utc(window_start_utc), to_naive_utc(window_end_utc)
    if we <= ws:
        raise HTTPException(status_code=400, detail="window_end_utc must be after window_start_utc")
    emails_list = [e.strip().lower() for e in participant_emails.split(",") if e.strip()]
    participants_info = [{"user_id": organizer.id, "email": organizer.email, "role": "organizer"}]
    all_user_ids: Set[int] = {organizer.id}
    for p_email in emails_list:
        if p_email == organizer.email.lower():
            continue
        user = db.query(User).filter(User.email == p_email).first()
        if user:
            all_user_ids.add(user.id)
            participants_info.append({"user_id": user.id, "email": user.email, "role": "participant"})
    busy_by_user, all_busy = collect_busy_by_participants(db, list(all_user_ids), ws, we, exclude_event_id=-1)
    gaps = find_gaps(ws, we, merge_intervals(all_busy))
    candidates = choose_slots(gaps, duration_minutes=duration_minutes, limit=candidate_limit)
    ranked = rank_slots(
        slots=candidates, busy_by_user=busy_by_user, required_users=set(all_user_ids),
        optional_users=set(), work_start_hour=work_start_hour, work_end_hour=work_end_hour, tz_name=tz_name,
    )
    return {
        "event_id": None, "display_timezone": tz_name, "participants": participants_info,
        "duration_minutes": duration_minutes,
        "window_start": format_dt_pair(ws, tz_name), "window_end": format_dt_pair(we, tz_name),
        "constraints": {"required_user_ids": sorted(all_user_ids), "optional_user_ids": [],
                        "work_start_hour": work_start_hour, "work_end_hour": work_end_hour},
        "candidate_slots": [format_interval(s, e, tz_name) for s, e in candidates],
        "ranked_slots": format_ranked_slots(ranked, max_results, tz_name),
        "conflicts_detected": build_conflicts_detected(participants_info, busy_by_user, tz_name),
    }
