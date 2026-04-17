from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import date

from app.db.session import get_db
from app.core.auth import get_current_user_email
from app.models.user import User
from app.models.holiday import Holiday
from app.schemas.holiday import HolidayCreate, HolidayOut
from app.core.date_conversion import ethiopian_to_gregorian
from app.core.seed_holidays import ensure_holiday_years_for_range

router = APIRouter(prefix="/holidays", tags=["holidays"])

def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def resolve_holiday_date(payload: HolidayCreate) -> date:
    if payload.calendar_type == "gregorian":
        if payload.g_year is None or payload.g_month is None or payload.g_day is None:
            raise HTTPException(
                status_code=400,
                detail="Gregorian holidays require g_year, g_month, and g_day",
            )
        return date(payload.g_year, payload.g_month, payload.g_day)

    if payload.calendar_type == "ethiopian":
        if payload.e_year is None or payload.e_month is None or payload.e_day is None:
            raise HTTPException(
                status_code=400,
                detail="Ethiopian holidays require e_year, e_month, and e_day",
            )
        converted = ethiopian_to_gregorian(
            payload.e_year, payload.e_month, payload.e_day
        )
        return date(converted["year"], converted["month"], converted["day"])

    raise HTTPException(status_code=400, detail="Unsupported calendar_type")

@router.post("", response_model=HolidayOut)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    _user = get_current_user(db, email)

    resolved = resolve_holiday_date(payload)

    holiday = Holiday(
        name=payload.name,
        category=payload.category,
        calendar_type=payload.calendar_type,
        g_year=payload.g_year,
        g_month=payload.g_month,
        g_day=payload.g_day,
        e_year=payload.e_year,
        e_month=payload.e_month,
        e_day=payload.e_day,
        resolved_date=resolved,
    )

    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return holiday

@router.get("", response_model=list[HolidayOut])
def list_holidays(
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    calendar_type: str | None = Query(None),
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    _user = get_current_user(db, email)

    if from_date and to_date:
        ensure_holiday_years_for_range(db, from_date.year, to_date.year)
    elif from_date:
        ensure_holiday_years_for_range(db, from_date.year, from_date.year)
    elif to_date:
        ensure_holiday_years_for_range(db, to_date.year, to_date.year)

    query = db.query(Holiday)

    if from_date:
        query = query.filter(Holiday.resolved_date >= from_date)

    if to_date:
        query = query.filter(Holiday.resolved_date <= to_date)

    if calendar_type:
        query = query.filter(Holiday.calendar_type == calendar_type)

    holidays = query.order_by(Holiday.resolved_date.asc(), Holiday.name.asc()).all()
    return holidays

@router.delete("/{holiday_id}")
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    _user = get_current_user(db, email)

    holiday = db.query(Holiday).filter(Holiday.id == holiday_id).first()
    if not holiday:
        raise HTTPException(status_code=404, detail="Holiday not found")

    db.delete(holiday)
    db.commit()

    return {"deleted": True, "holiday_id": holiday_id}