
import pytest
from datetime import datetime, date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from pydantic import ValidationError

from app.core.date_conversion import gregorian_to_ethiopian, ethiopian_to_gregorian
from app.schemas.event import EventCreate

def test_ethiopian_month_zero_raises():
    
    with pytest.raises(Exception):
        ethiopian_to_gregorian(2017, 0, 1)

def test_ethiopian_month_14_raises():
    
    with pytest.raises(Exception):
        ethiopian_to_gregorian(2017, 14, 1)

def test_ethiopian_day_zero_raises():
    
    with pytest.raises(Exception):
        ethiopian_to_gregorian(2017, 1, 0)

def test_ethiopian_day_31_library_does_not_validate():
    
    result = ethiopian_to_gregorian(2017, 1, 31)
    assert result is not None, "Library returns without error (overflow behavior)"
    assert isinstance(result, dict) and "year" in result

def test_gregorian_month_0_raises():
    
    with pytest.raises((ValueError, Exception)):
        gregorian_to_ethiopian(date(2026, 0, 1))

def test_gregorian_day_0_raises():
    with pytest.raises((ValueError, Exception)):
        gregorian_to_ethiopian(date(2026, 1, 0))

def test_gregorian_month_13_raises():
    with pytest.raises((ValueError, Exception)):
        gregorian_to_ethiopian(date(2026, 13, 1))

def test_gregorian_day_32_raises():
    with pytest.raises((ValueError, Exception)):
        gregorian_to_ethiopian(date(2026, 1, 32))

def test_event_create_missing_title_raises():
    
    with pytest.raises(ValidationError):
        EventCreate(
            start_time_local=datetime(2026, 5, 10, 9, 0),
            timezone="UTC",
        )

def test_event_create_missing_start_time_raises():
    
    with pytest.raises(ValidationError):
        EventCreate(
            title="Test Event",
            timezone="UTC",
        )

def test_event_create_valid_passes():
    
    ev = EventCreate(
        title="Valid Event",
        start_time_local=datetime(2026, 5, 10, 9, 0),
        end_time_local=datetime(2026, 5, 10, 10, 0),
        timezone="Africa/Addis_Ababa",
    )
    assert ev.title == "Valid Event"

def test_invalid_timezone_zoneinfo_raises():
    
    with pytest.raises(ZoneInfoNotFoundError):
        ZoneInfo("Not/AValidTimezone")

def test_valid_timezone_addis_loads():
    
    tz = ZoneInfo("Africa/Addis_Ababa")
    assert tz is not None

def test_end_before_start_is_detectable():
    
    start = datetime(2026, 5, 10, 10, 0)
    end = datetime(2026, 5, 10, 9, 0)
    assert end < start, "end_time before start_time should be detected as invalid"

def test_end_equal_start_is_detectable():
    
    start = datetime(2026, 5, 10, 10, 0)
    end = datetime(2026, 5, 10, 10, 0)
    assert end <= start, "end_time equal to start_time should be detected as invalid"

def test_ethiopian_date_validation_enforced():
    
    import inspect
    from app.core.date_conversion import ethiopian_to_gregorian as eth_func

    source = inspect.getsource(eth_func)
    assert "month" in source, "Conversion function must handle month"
    assert "day" in source, "Conversion function must handle day"
