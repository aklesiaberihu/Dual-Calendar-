import pytest
from datetime import date
from app.core.date_conversion import gregorian_to_ethiopian, ethiopian_to_gregorian


def test_gregorian_to_ethiopian_known_date():
    # Sept 11 2024 = Meskerem 1 2017 (Ethiopian New Year)
    result = gregorian_to_ethiopian(date(2024, 9, 11))
    assert result["year"] == 2017
    assert result["month"] == 1
    assert result["day"] == 1
    assert result["month_name"] == "Meskerem"


def test_gregorian_to_ethiopian_returns_all_fields():
    result = gregorian_to_ethiopian(date(2026, 1, 1))
    assert "year" in result
    assert "month" in result
    assert "day" in result
    assert "month_name" in result


def test_gregorian_to_ethiopian_month_name_valid():
    result = gregorian_to_ethiopian(date(2025, 3, 10))
    valid_months = [
        "Meskerem", "Tikimt", "Hidar", "Tahsas", "Tir", "Yekatit",
        "Megabit", "Miyazya", "Ginbot", "Sene", "Hamle", "Nehase", "Pagume"
    ]
    assert result["month_name"] in valid_months


def test_ethiopian_to_gregorian_known_date():
    # Meskerem 1 2017 = Sept 11 2024
    result = ethiopian_to_gregorian(2017, 1, 1)
    assert result["year"] == 2024
    assert result["month"] == 9
    assert result["day"] == 11


def test_ethiopian_to_gregorian_returns_all_fields():
    result = ethiopian_to_gregorian(2016, 6, 1)
    assert "year" in result
    assert "month" in result
    assert "day" in result


def test_round_trip_gregorian_ethiopian():
    original = date(2025, 6, 15)
    eth = gregorian_to_ethiopian(original)
    back = ethiopian_to_gregorian(eth["year"], eth["month"], eth["day"])
    assert back["year"] == original.year
    assert back["month"] == original.month
    assert back["day"] == original.day


def test_ethiopian_13th_month_pagume():
    # A known Pagume date near Ethiopian year-end
    result = gregorian_to_ethiopian(date(2024, 9, 6))
    assert result["month"] == 13
    assert result["month_name"] == "Pagume"


def test_gregorian_to_ethiopian_leap_year():
    result = gregorian_to_ethiopian(date(2024, 2, 29))
    assert result["year"] is not None
    assert result["month"] is not None
    assert result["day"] is not None