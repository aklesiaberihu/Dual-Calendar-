
import pytest
from datetime import date
from app.core.date_conversion import gregorian_to_ethiopian, ethiopian_to_gregorian

def test_ethiopian_new_year_sept_12_non_leap():
    result = gregorian_to_ethiopian(date(2023, 9, 12))
    assert result["month"] == 1
    assert result["day"] == 1
    assert result["month_name"] == "Meskerem"

def test_day_before_ethiopian_new_year():
    result = gregorian_to_ethiopian(date(2023, 9, 10))
    assert result["month"] == 13
    assert result["month_name"] == "Pagume"

def test_ethiopian_new_year_leap_sept_11():
    result = gregorian_to_ethiopian(date(2024, 9, 11))
    assert result["month"] == 1
    assert result["day"] == 1
    assert result["month_name"] == "Meskerem"

def test_pagume_is_13th_month():
    result = gregorian_to_ethiopian(date(2025, 9, 7))
    assert result["month"] == 13
    assert result["month_name"] == "Pagume"

def test_pagume_non_leap_has_5_days():
    result = ethiopian_to_gregorian(2017, 13, 5)
    assert result["year"] is not None
    assert result["month"] is not None
    assert result["day"] is not None

def test_pagume_leap_has_6_days():
    result = ethiopian_to_gregorian(2015, 13, 6)
    assert result["year"] is not None
    assert result["month"] is not None
    assert result["day"] is not None

@pytest.mark.parametrize("g_date", [
    date(2020, 1, 1),
    date(2021, 6, 15),
    date(2022, 12, 31),
    date(2023, 3, 21),
    date(2024, 9, 11),
    date(2025, 2, 28),
])
def test_round_trip_multiple_dates(g_date):
    eth = gregorian_to_ethiopian(g_date)
    back = ethiopian_to_gregorian(eth["year"], eth["month"], eth["day"])
    assert back["year"] == g_date.year
    assert back["month"] == g_date.month
    assert back["day"] == g_date.day

def test_gregorian_jan_1_converts_correctly():
    result = gregorian_to_ethiopian(date(2026, 1, 1))
    assert result["year"] == 2018
    assert result["month"] == 4
    assert result["month_name"] == "Tahsas"

def test_gregorian_dec_31_in_ethiopian_year():
    result = gregorian_to_ethiopian(date(2025, 12, 31))
    assert result["year"] is not None
    assert result["month"] in range(1, 14)

def test_ethiopian_first_day_of_year_round_trips():
    greg = ethiopian_to_gregorian(2016, 1, 1)
    back = gregorian_to_ethiopian(date(greg["year"], greg["month"], greg["day"]))
    assert back["year"] == 2016
    assert back["month"] == 1
    assert back["day"] == 1

def test_all_13_month_names_reachable():
    
    seen_months = set()
    start = date(2024, 9, 11)
    from datetime import timedelta
    for i in range(400):
        d = start + timedelta(days=i)
        result = gregorian_to_ethiopian(d)
        seen_months.add(result["month_name"])
        if len(seen_months) == 13:
            break
    expected = {
        "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
        "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"
    }
    assert seen_months == expected
