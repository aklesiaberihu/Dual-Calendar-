import pytest
from datetime import datetime, timedelta
from app.core.scheduling import event_end_time, overlaps, DEFAULT_DURATION_MINUTES


def dt(hour, minute=0):
    return datetime(2025, 1, 1, hour, minute)


# --- event_end_time ---

def test_event_end_time_with_end():
    start = dt(10)
    end = dt(11)
    assert event_end_time(start, end) == end


def test_event_end_time_without_end():
    start = dt(10)
    result = event_end_time(start, None)
    assert result == start + timedelta(minutes=DEFAULT_DURATION_MINUTES)


def test_event_end_time_default_is_60_minutes():
    start = dt(9)
    result = event_end_time(start, None)
    assert result == dt(10)


# --- overlaps ---

def test_overlaps_true():
    assert overlaps(dt(10), dt(12), dt(11), dt(13)) is True


def test_overlaps_false_no_contact():
    assert overlaps(dt(10), dt(11), dt(12), dt(13)) is False


def test_overlaps_touching_edges_no_overlap():
    # [10,11) and [11,12) share only the boundary — not a real overlap
    assert overlaps(dt(10), dt(11), dt(11), dt(12)) is False


def test_overlaps_contained():
    # B is fully inside A
    assert overlaps(dt(9), dt(13), dt(10), dt(12)) is True


def test_overlaps_identical():
    assert overlaps(dt(10), dt(11), dt(10), dt(11)) is True


def test_overlaps_a_inside_b():
    assert overlaps(dt(10), dt(11), dt(9), dt(13)) is True


def test_overlaps_b_before_a():
    assert overlaps(dt(12), dt(13), dt(9), dt(10)) is False