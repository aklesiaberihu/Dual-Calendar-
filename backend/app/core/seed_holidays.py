from datetime import date
from sqlalchemy.orm import Session

from app.models.holiday import Holiday
from app.core.date_conversion import ethiopian_to_gregorian

GREGORIAN_TEMPLATES = [
    {"name": "New Year's Day", "category": "public", "month": 1, "day": 1},
    {"name": "Epiphany", "category": "religious", "month": 1, "day": 6},
    {"name": "Liberation Day", "category": "public", "month": 4, "day": 25},
    {"name": "International Workers' Day", "category": "public", "month": 5, "day": 1},
    {"name": "Republic Day", "category": "public", "month": 6, "day": 2},
    {"name": "Assumption Day", "category": "religious", "month": 8, "day": 15},
    {"name": "All Saints' Day", "category": "religious", "month": 11, "day": 1},
    {"name": "Immaculate Conception", "category": "religious", "month": 12, "day": 8},
    {"name": "Christmas Day", "category": "religious", "month": 12, "day": 25},
    {"name": "St. Stephen's Day", "category": "religious", "month": 12, "day": 26},
    {"name": "Adwa Victory Day", "category": "public", "month": 3, "day": 2},
    {"name": "Patriots' Victory Day", "category": "public", "month": 5, "day": 5},
    {"name": "Downfall of the Derg", "category": "public", "month": 5, "day": 28},
]

ETHIOPIAN_TEMPLATES = [
    {"name": "Enkutatash", "category": "cultural", "month": 1, "day": 1},
    {"name": "Meskel", "category": "religious", "month": 1, "day": 17},
    {"name": "Genna", "category": "religious", "month": 4, "day": 29},
    {"name": "Timkat", "category": "religious", "month": 5, "day": 11},
]

def holiday_exists(
    db: Session,
    *,
    name: str,
    calendar_type: str,
    resolved: date,
    g_year=None,
    g_month=None,
    g_day=None,
    e_year=None,
    e_month=None,
    e_day=None,
) -> bool:
    query = db.query(Holiday).filter(
        Holiday.name == name,
        Holiday.calendar_type == calendar_type,
        Holiday.resolved_date == resolved,
    )

    if calendar_type == "gregorian":
        query = query.filter(
            Holiday.g_year == g_year,
            Holiday.g_month == g_month,
            Holiday.g_day == g_day,
        )
    else:
        query = query.filter(
            Holiday.e_year == e_year,
            Holiday.e_month == e_month,
            Holiday.e_day == e_day,
        )

    return db.query(query.exists()).scalar()

def ensure_gregorian_year(db: Session, year: int):
    inserted = 0

    for tpl in GREGORIAN_TEMPLATES:
        resolved = date(year, tpl["month"], tpl["day"])

        if holiday_exists(
            db,
            name=tpl["name"],
            calendar_type="gregorian",
            resolved=resolved,
            g_year=year,
            g_month=tpl["month"],
            g_day=tpl["day"],
        ):
            continue

        holiday = Holiday(
            name=tpl["name"],
            category=tpl["category"],
            calendar_type="gregorian",
            g_year=year,
            g_month=tpl["month"],
            g_day=tpl["day"],
            e_year=None,
            e_month=None,
            e_day=None,
            resolved_date=resolved,
        )
        db.add(holiday)
        inserted += 1

    if inserted > 0:
        db.commit()

def ensure_ethiopian_year(db: Session, e_year: int):
    inserted = 0

    for tpl in ETHIOPIAN_TEMPLATES:
        converted = ethiopian_to_gregorian(e_year, tpl["month"], tpl["day"])
        resolved = date(converted["year"], converted["month"], converted["day"])

        if holiday_exists(
            db,
            name=tpl["name"],
            calendar_type="ethiopian",
            resolved=resolved,
            e_year=e_year,
            e_month=tpl["month"],
            e_day=tpl["day"],
        ):
            continue

        holiday = Holiday(
            name=tpl["name"],
            category=tpl["category"],
            calendar_type="ethiopian",
            g_year=None,
            g_month=None,
            g_day=None,
            e_year=e_year,
            e_month=tpl["month"],
            e_day=tpl["day"],
            resolved_date=resolved,
        )
        db.add(holiday)
        inserted += 1

    if inserted > 0:
        db.commit()

def seed_default_holidays(db: Session):
    for year in range(2024, 2029):
        ensure_gregorian_year(db, year)

    for e_year in range(2016, 2021):
        ensure_ethiopian_year(db, e_year)

def ensure_holiday_years_for_range(
    db: Session,
    from_year: int,
    to_year: int,
):
    if from_year > to_year:
        from_year, to_year = to_year, from_year

    for year in range(from_year, to_year + 1):
        ensure_gregorian_year(db, year)

    candidate_ethiopian_years = set()
    for year in range(from_year, to_year + 1):
        candidate_ethiopian_years.add(year - 8)
        candidate_ethiopian_years.add(year - 7)

    for e_year in sorted(candidate_ethiopian_years):
        ensure_ethiopian_year(db, e_year)