from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.schemas.event import EventCreate, EventUpdate
from app.schemas.participants import ShareEventIn
from app.models.user import User
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.core.security import (
    get_current_user,
    get_event_with_access,
    require_editor_or_owner,
    require_owner,
)
from app.core.scheduling import (
    serialize_event,
    create_single_event,
    create_recurring_series,
    apply_event_update,
    query_events,
)

router = APIRouter(prefix="/events", tags=["events"])


@router.post("")
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    if payload.start_time_local is None:
        raise HTTPException(status_code=400, detail="start_time_local is required")
    if payload.end_time_local is not None and payload.end_time_local <= payload.start_time_local:
        raise HTTPException(status_code=400, detail="end_time_local must be after start_time_local")
    if payload.recurrence_rule == "none":
        return create_single_event(db, user, payload)
    return create_recurring_series(db, user, payload)


@router.get("")
def list_events(
    q: str = Query("", description="search title/description"),
    timezone: str = Query("", description="filter by timezone"),
    start_from: str | None = Query(None, description="ISO datetime lower bound"),
    start_to: str | None = Query(None, description="ISO datetime upper bound"),
    ownership: str = Query("all", description="all | owned | shared"),
    limit: int = Query(100, ge=1, le=500, description="NFR-P1: max results per page (1–500)"),
    offset: int = Query(0, ge=0, description="NFR-P1: number of results to skip for pagination"),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    return [serialize_event(e) for e in query_events(db, user, q, timezone, start_from, start_to, ownership, limit, offset)]


@router.get("/{event_id}")
def get_event(
    event_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)
    return serialize_event(event)


@router.put("/{event_id}")
def update_event(
    event_id: int,
    payload: EventUpdate,
    force: bool = False,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_editor_or_owner(role)
    if not force and payload.version != event.version:
        return JSONResponse(
            status_code=409,
            content={
                "detail": "Version conflict",
                "code": "VERSION_CONFLICT",
                "event_id": event.id,
                "your_version": payload.version,
                "current_version": event.version,
                "current_event": serialize_event(event),
            },
        )
    apply_event_update(db, event, payload)
    return serialize_event(event)


@router.delete("/{event_id}")
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)
    db.delete(event)
    db.commit()
    return {"deleted": True, "event_id": event_id}


@router.post("/{event_id}/share")
def share_event(
    event_id: int,
    payload: ShareEventIn,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)
    target = db.query(User).filter(User.email == payload.email).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target user not found")
    if target.id == event.user_id:
        raise HTTPException(status_code=400, detail="Owner already has access")
    existing = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == target.id)
        .first()
    )
    if existing:
        existing.role = payload.role
    else:
        db.add(EventParticipant(event_id=event_id, user_id=target.id, role=payload.role))
    db.commit()
    return {"shared": True, "event_id": event_id, "user_id": target.id, "role": payload.role}


@router.get("/{event_id}/participants")
def list_participants(
    event_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)
    participants = db.query(EventParticipant).filter(EventParticipant.event_id == event.id).all()
    owner = db.query(User).filter(User.id == event.user_id).first()
    result = [{"user_id": owner.id, "email": owner.email, "role": "owner"}]
    for p in participants:
        result.append({"user_id": p.user_id, "email": p.user.email, "role": p.role})
    return result


@router.get("/{event_id}/series")
def get_event_series(
    event_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, _role = get_event_with_access(db, user, event_id)
    if not event.recurrence_group_id:
        return {"group_id": None, "total": 1, "events": [serialize_event(event)]}
    series = (
        db.query(Event)
        .filter(Event.recurrence_group_id == event.recurrence_group_id)
        .order_by(Event.start_time_utc.asc())
        .all()
    )
    return {
        "group_id": event.recurrence_group_id,
        "recurrence_rule": event.recurrence_rule,
        "recurrence_interval": event.recurrence_interval,
        "recurrence_byday": event.recurrence_byday,
        "total": len(series),
        "events": [serialize_event(e) for e in series],
    }


@router.delete("/{event_id}/series")
def delete_event_series(
    event_id: int,
    scope: str = Query("all", description="all | from_here"),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    event, role = get_event_with_access(db, user, event_id)
    require_owner(role)
    if not event.recurrence_group_id:
        db.delete(event)
        db.commit()
        return {"deleted": 1, "scope": "single"}
    query = db.query(Event).filter(Event.recurrence_group_id == event.recurrence_group_id)
    if scope == "from_here":
        query = query.filter(Event.start_time_utc >= event.start_time_utc)
    to_delete = query.all()
    count = len(to_delete)
    for e in to_delete:
        db.delete(e)
    db.commit()
    return {"deleted": count, "scope": scope}


@router.delete("/{event_id}/participants/{user_id}")
def remove_participant(
    event_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    _event, role = get_event_with_access(db, user, event_id)
    require_owner(role)
    p = (
        db.query(EventParticipant)
        .filter(EventParticipant.event_id == event_id, EventParticipant.user_id == user_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    db.delete(p)
    db.commit()
    return {"removed": True, "event_id": event_id, "user_id": user_id}
