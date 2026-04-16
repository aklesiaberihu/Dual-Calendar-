from pydantic import BaseModel
from typing import Optional, Literal
from datetime import date

CalendarType = Literal["gregorian", "ethiopian"]
HolidayCategory = Literal["public", "religious", "cultural"]


class HolidayCreate(BaseModel):
    name: str
    category: HolidayCategory = "public"
    calendar_type: CalendarType

    g_year: Optional[int] = None
    g_month: Optional[int] = None
    g_day: Optional[int] = None

    e_year: Optional[int] = None
    e_month: Optional[int] = None
    e_day: Optional[int] = None


class HolidayOut(BaseModel):
    id: int
    name: str
    category: str
    calendar_type: str

    g_year: Optional[int] = None
    g_month: Optional[int] = None
    g_day: Optional[int] = None

    e_year: Optional[int] = None
    e_month: Optional[int] = None
    e_day: Optional[int] = None

    resolved_date: date

    class Config:
        from_attributes = True