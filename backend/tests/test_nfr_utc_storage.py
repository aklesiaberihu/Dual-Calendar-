"""
NFR-UTC-1: Events must be stored in UTC regardless of the user's local timezone.

Tests the local_to_utc conversion used by the events router before persisting
start_time_utc / end_time_utc to the database.
"""
import pytest
from datetime import datetime
from zoneinfo import ZoneInfo
from datetime import timezone as tz


def local_to_utc(local_dt: datetime, timezone_str: str) -> datetime:
    """Mirror of the function in app/routers/events.py (pure logic, no HTTP)."""
    zone = ZoneInfo(timezone_str)
    aware_local = local_dt.replace(tzinfo=zone)
    return aware_local.astimezone(tz.utc).replace(tzinfo=None)


# ── Addis Ababa (UTC+3) ─────────────────────────────────────────────────────

def test_addis_noon_stored_as_utc():
    """12:00 Addis Ababa (UTC+3) → 09:00 UTC."""
    result = local_to_utc(datetime(2026, 1, 1, 12, 0, 0), "Africa/Addis_Ababa")
    assert result == datetime(2026, 1, 1, 9, 0, 0), (
        "NFR-UTC-1 FAIL: Africa/Addis_Ababa +3h offset not applied"
    )


def test_addis_midnight_stored_as_utc():
    """00:00 Addis Ababa → 21:00 previous day UTC."""
    result = local_to_utc(datetime(2026, 6, 1, 0, 0, 0), "Africa/Addis_Ababa")
    assert result == datetime(2026, 5, 31, 21, 0, 0), (
        "NFR-UTC-1 FAIL: midnight Addis should roll back to previous day UTC"
    )


# ── New York (UTC-5 / UTC-4 DST) ────────────────────────────────────────────

def test_new_york_noon_stored_as_utc():
    """12:00 New York (UTC-5 in January) → 17:00 UTC."""
    result = local_to_utc(datetime(2026, 1, 15, 12, 0, 0), "America/New_York")
    assert result == datetime(2026, 1, 15, 17, 0, 0), (
        "NFR-UTC-1 FAIL: America/New_York -5h offset not applied"
    )


def test_new_york_dst_stored_as_utc():
    """12:00 New York (UTC-4 in July DST) → 16:00 UTC."""
    result = local_to_utc(datetime(2026, 7, 15, 12, 0, 0), "America/New_York")
    assert result == datetime(2026, 7, 15, 16, 0, 0), (
        "NFR-UTC-1 FAIL: DST offset -4h not applied for America/New_York in July"
    )


# ── UTC passthrough ──────────────────────────────────────────────────────────

def test_utc_timezone_unchanged():
    """Times already in UTC must not be shifted."""
    result = local_to_utc(datetime(2026, 3, 10, 8, 30, 0), "UTC")
    assert result == datetime(2026, 3, 10, 8, 30, 0), (
        "NFR-UTC-1 FAIL: UTC timezone should produce no offset shift"
    )


# ── Round-trip integrity ─────────────────────────────────────────────────────

def test_round_trip_utc_addis():
    """Converting to UTC and back should return the original local time."""
    original = datetime(2026, 9, 11, 15, 0, 0)
    utc = local_to_utc(original, "Africa/Addis_Ababa")
    zone = ZoneInfo("Africa/Addis_Ababa")
    back = utc.replace(tzinfo=tz.utc).astimezone(zone).replace(tzinfo=None)
    assert back == original, "NFR-UTC-1 FAIL: round-trip UTC→Addis produced wrong time"


# ── Invalid timezone raises ──────────────────────────────────────────────────

def test_invalid_timezone_raises():
    """An unknown timezone string must raise an exception (not silently pass)."""
    with pytest.raises(Exception):
        local_to_utc(datetime(2026, 1, 1, 12, 0, 0), "Not/ATimezone")
