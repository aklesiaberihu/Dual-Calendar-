
import pytest
from datetime import datetime, date, timedelta
from app.core.recurrence import expand_occurrences, MAX_OCCURRENCES

BASE = datetime(2026, 6, 10, 9, 0, 0)
DUR  = timedelta(hours=1)

def test_daily_count_3():
    res = expand_occurrences("daily", 1, [], "count", 3, None, BASE, DUR)
    assert len(res) == 3
    assert res[0][0] == BASE
    assert res[1][0] == datetime(2026, 6, 11, 9, 0)
    assert res[2][0] == datetime(2026, 6, 12, 9, 0)
    assert res[0][1] == BASE + DUR

def test_daily_every_2_count_4():
    res = expand_occurrences("daily", 2, [], "count", 4, None, BASE, DUR)
    assert len(res) == 4
    assert res[1][0] == BASE + timedelta(days=2)
    assert res[3][0] == BASE + timedelta(days=6)

def test_daily_until_inclusive():
    end_date = date(2026, 6, 13)
    res = expand_occurrences("daily", 1, [], "until", 999, end_date, BASE, DUR)

    assert len(res) == 4
    assert res[-1][0].date() == end_date

def test_daily_until_same_day():
    end_date = BASE.date()
    res = expand_occurrences("daily", 1, [], "until", 999, end_date, BASE, DUR)
    assert len(res) == 1
    assert res[0][0] == BASE

def test_weekly_no_byday_defaults_to_base_weekday():

    res = expand_occurrences("weekly", 1, [], "count", 4, None, BASE, DUR)
    assert len(res) == 4
    for start, _ in res:
        assert start.weekday() == 2, f"Expected Wednesday, got {start.strftime('%A')}"
    assert res[1][0] == BASE + timedelta(weeks=1)

def test_weekly_byday_mon_wed_from_wednesday():

    res = expand_occurrences("weekly", 1, ["MON", "WED"], "count", 4, None, BASE, DUR)
    assert len(res) == 4
    assert res[0][0] == datetime(2026, 6, 10, 9, 0)
    assert res[1][0].weekday() == 0
    assert res[1][0] == datetime(2026, 6, 15, 9, 0)
    assert res[2][0].weekday() == 2
    assert res[3][0].weekday() == 0

def test_weekly_every_2_byday_fri():

    res = expand_occurrences("weekly", 2, ["FRI"], "count", 3, None, BASE, DUR)
    assert len(res) == 3
    for start, _ in res:
        assert start.weekday() == 4

    assert res[0][0] == datetime(2026, 6, 12, 9, 0)

    assert res[1][0] == datetime(2026, 6, 26, 9, 0)

def test_weekly_until_stops_on_date():
    end_date = date(2026, 6, 24)
    res = expand_occurrences("weekly", 1, ["WED"], "until", 999, end_date, BASE, DUR)

    assert len(res) == 3
    assert res[-1][0].date() == end_date

def test_monthly_count_3():
    res = expand_occurrences("monthly", 1, [], "count", 3, None, BASE, DUR)
    assert len(res) == 3
    assert res[0][0] == BASE
    assert res[1][0] == datetime(2026, 7, 10, 9, 0)
    assert res[2][0] == datetime(2026, 8, 10, 9, 0)

def test_monthly_every_3():
    res = expand_occurrences("monthly", 3, [], "count", 3, None, BASE, DUR)
    assert len(res) == 3
    assert res[1][0] == datetime(2026, 9, 10, 9, 0)
    assert res[2][0] == datetime(2026, 12, 10, 9, 0)

def test_monthly_clamps_to_last_day_of_month():

    jan_31 = datetime(2026, 1, 31, 9, 0, 0)
    res = expand_occurrences("monthly", 1, [], "count", 4, None, jan_31, DUR)
    assert len(res) == 4
    assert res[0][0].day == 31
    assert res[1][0].day == 28
    assert res[2][0].day == 31
    assert res[3][0].day == 30

def test_monthly_until():
    end_date = date(2026, 9, 1)
    res = expand_occurrences("monthly", 1, [], "until", 999, end_date, BASE, DUR)

    assert len(res) == 3
    assert res[-1][0].month == 8

def test_no_duration_returns_none_end():
    res = expand_occurrences("daily", 1, [], "count", 2, None, BASE, None)
    assert len(res) == 2
    assert res[0] == (BASE, None)
    assert res[1] == (BASE + timedelta(days=1), None)

def test_max_occurrences_cap():
    res = expand_occurrences("daily", 1, [], "count", MAX_OCCURRENCES + 100, None, BASE, DUR)
    assert len(res) == MAX_OCCURRENCES

def test_count_1_returns_single_event():
    res = expand_occurrences("daily", 1, [], "count", 1, None, BASE, DUR)
    assert len(res) == 1
    assert res[0][0] == BASE

def test_interval_1_weekly_byday_order_preserved():

    res = expand_occurrences("weekly", 1, ["FRI", "MON"], "count", 4, None, BASE, DUR)

    dates = [r[0] for r in res]
    assert dates == sorted(dates), "Occurrences are not in chronological order"
