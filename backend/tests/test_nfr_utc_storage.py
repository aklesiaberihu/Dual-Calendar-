
import pytest
from datetime import datetime
from zoneinfo import ZoneInfo
from datetime import timezone as tz

def local_to_utc(local_dt: datetime, timezone_str: str) -> datetime:
    
    zone = ZoneInfo(timezone_str)
    aware_local = local_dt.replace(tzinfo=zone)
    return aware_local.astimezone(tz.utc).replace(tzinfo=None)

def test_addis_noon_stored_as_utc():
    
    result = local_to_utc(datetime(2026, 1, 1, 12, 0, 0), "Africa/Addis_Ababa")
    assert result == datetime(2026, 1, 1, 9, 0, 0), (
        "NFR-UTC-1 FAIL: Africa/Addis_Ababa +3h offset not applied"
    )

def test_addis_midnight_stored_as_utc():
    
    result = local_to_utc(datetime(2026, 6, 1, 0, 0, 0), "Africa/Addis_Ababa")
    assert result == datetime(2026, 5, 31, 21, 0, 0), (
        "NFR-UTC-1 FAIL: midnight Addis should roll back to previous day UTC"
    )

def test_new_york_noon_stored_as_utc():
    
    result = local_to_utc(datetime(2026, 1, 15, 12, 0, 0), "America/New_York")
    assert result == datetime(2026, 1, 15, 17, 0, 0), (
        "NFR-UTC-1 FAIL: America/New_York -5h offset not applied"
    )

def test_new_york_dst_stored_as_utc():
    
    result = local_to_utc(datetime(2026, 7, 15, 12, 0, 0), "America/New_York")
    assert result == datetime(2026, 7, 15, 16, 0, 0), (
        "NFR-UTC-1 FAIL: DST offset -4h not applied for America/New_York in July"
    )

def test_utc_timezone_unchanged():
    
    result = local_to_utc(datetime(2026, 3, 10, 8, 30, 0), "UTC")
    assert result == datetime(2026, 3, 10, 8, 30, 0), (
        "NFR-UTC-1 FAIL: UTC timezone should produce no offset shift"
    )

def test_round_trip_utc_addis():
    
    original = datetime(2026, 9, 11, 15, 0, 0)
    utc = local_to_utc(original, "Africa/Addis_Ababa")
    zone = ZoneInfo("Africa/Addis_Ababa")
    back = utc.replace(tzinfo=tz.utc).astimezone(zone).replace(tzinfo=None)
    assert back == original, "NFR-UTC-1 FAIL: round-trip UTC→Addis produced wrong time"

def test_invalid_timezone_raises():
    
    with pytest.raises(Exception):
        local_to_utc(datetime(2026, 1, 1, 12, 0, 0), "Not/ATimezone")
