from fastapi import APIRouter
from datetime import date
from app.core.date_conversion import (
    gregorian_to_ethiopian,
    ethiopian_to_gregorian
)

router = APIRouter(prefix="/convert", tags=["date-conversion"])

@router.get("/gregorian-to-ethiopian")
def convert_gregorian_to_ethiopian(year: int, month: int, day: int):
    g_date = date(year, month, day)
    return gregorian_to_ethiopian(g_date)

@router.get("/ethiopian-to-gregorian")
def convert_ethiopian_to_gregorian(year: int, month: int, day: int):
    return ethiopian_to_gregorian(year, month, day)
