from datetime import date
from ethiopian_date.ethiopian_date import EthiopianDateConverter

def gregorian_to_ethiopian(g_date: date) -> dict:
    y, m, d = EthiopianDateConverter.to_ethiopian(g_date.year, g_date.month, g_date.day)
    return {"year": y, "month": m, "day": d}

def ethiopian_to_gregorian(year: int, month: int, day: int) -> dict:
    y, m, d = EthiopianDateConverter.to_gregorian(year, month, day)
    return {"year": y, "month": m, "day": d}
