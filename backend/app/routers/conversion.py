from fastapi import APIRouter, HTTPException
from datetime import date
from app.core.date_conversion import (
    gregorian_to_ethiopian,
    ethiopian_to_gregorian
)

router = APIRouter(prefix="/convert", tags=["date-conversion"])

def _validate_ethiopian_date(year: int, month: int, day: int) -> None:
    if not (1 <= month <= 13):
        raise HTTPException(status_code=400, detail="Ethiopian month must be 1-13")
    if not (1 <= day <= 30):
        raise HTTPException(status_code=400, detail="Ethiopian day must be 1-30")
    if year <= 0:
        raise HTTPException(status_code=400, detail="Ethiopian year must be positive")

@router.get("/gregorian-to-ethiopian")
def convert_gregorian_to_ethiopian(year: int, month: int, day: int):
    g_date = date(year, month, day)
    return gregorian_to_ethiopian(g_date)

@router.get("/ethiopian-to-gregorian")
def convert_ethiopian_to_gregorian(year: int, month: int, day: int):
    _validate_ethiopian_date(year, month, day)
    return ethiopian_to_gregorian(year, month, day)

@router.get("/g2e")
def g2e(year: int, month: int, day: int):
    g_date = date(year, month, day)
    return gregorian_to_ethiopian(g_date)

@router.get("/e2g")
def e2g(year: int, month: int, day: int):
    _validate_ethiopian_date(year, month, day)
    return ethiopian_to_gregorian(year, month, day)
