from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from ethiopian_date.ethiopian_date import EthiopianDateConverter

ETH_MONTHS = {
    1: "Meskerem",
    2: "Tikimt",
    3: "Hidar",
    4: "Tahsas",
    5: "Tir",
    6: "Yekatit",
    7: "Megabit",
    8: "Miyazya",
    9: "Ginbot",
    10: "Sene",
    11: "Hamle",
    12: "Nehase",
    13: "Pagume",
}


def _gregorian_to_eth_jdn(year: int, month: int, day: int):
    a = (14 - month) // 12
    y = year + 4800 - a
    m = month + 12 * a - 3
    jdn = day + (153 * m + 2) // 5 + 365 * y + y // 4 - y // 100 + y // 400 - 32045
    diff = jdn - 1724221
    r = diff % 1461
    n = r % 365 + 365 * (r // 1460)
    eth_year  = 4 * (diff // 1461) + r // 365 - r // 1460 + 1
    eth_month = n // 30 + 1
    eth_day   = n % 30 + 1
    return eth_year, eth_month, eth_day


def gregorian_to_ethiopian(g_date: date) -> dict:
    try:
        out = EthiopianDateConverter.to_ethiopian(g_date.year, g_date.month, g_date.day)
        if isinstance(out, tuple):
            y, m, d = out
        else:
            y, m, d = out.year, out.month, out.day
    except ValueError:
        y, m, d = _gregorian_to_eth_jdn(g_date.year, g_date.month, g_date.day)
    return {"year": y, "month": m, "day": d, "month_name": ETH_MONTHS.get(m)}


def ethiopian_to_gregorian(year: int, month: int, day: int) -> dict:
    out = EthiopianDateConverter.to_gregorian(year, month, day)
    if isinstance(out, tuple):
        y, m, d = out
    else:
        y, m, d = out.year, out.month, out.day
    return {"year": y, "month": m, "day": d}


def utc_to_local(utc_dt: Optional[datetime], timezone_str: str) -> Optional[datetime]:
    if not utc_dt:
        return None
    try:
        tz = ZoneInfo(timezone_str or "UTC")
    except Exception:
        tz = ZoneInfo("UTC")
    return utc_dt.replace(tzinfo=timezone.utc).astimezone(tz).replace(tzinfo=None)


def local_to_utc(local_dt: datetime, timezone_str: str) -> datetime:
    try:
        tz = ZoneInfo(timezone_str or "UTC")
    except Exception:
        raise ValueError(f"Invalid timezone: {timezone_str}")
    return local_dt.replace(tzinfo=tz).astimezone(timezone.utc).replace(tzinfo=None)
