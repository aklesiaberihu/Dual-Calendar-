import pytest
from datetime import datetime
from app.core.intervals import normalize, merge_intervals, find_gaps, choose_slots

def dt(hour, minute=0):
    return datetime(2025, 1, 1, hour, minute)

def test_normalize_removes_invalid():
    intervals = [(dt(10), dt(9)), (dt(8), dt(9))]
    result = normalize(intervals)
    assert result == [(dt(8), dt(9))]

def test_normalize_sorts():
    intervals = [(dt(12), dt(13)), (dt(8), dt(9)), (dt(10), dt(11))]
    result = normalize(intervals)
    assert result == [(dt(8), dt(9)), (dt(10), dt(11)), (dt(12), dt(13))]

def test_normalize_removes_none():
    intervals = [(None, dt(9)), (dt(8), None), (dt(10), dt(11))]
    result = normalize(intervals)
    assert result == [(dt(10), dt(11))]

def test_normalize_empty():
    assert normalize([]) == []

def test_merge_overlapping():
    intervals = [(dt(10), dt(11)), (dt(10, 30), dt(12))]
    result = merge_intervals(intervals)
    assert result == [(dt(10), dt(12))]

def test_merge_touching():
    intervals = [(dt(10), dt(11)), (dt(11), dt(12))]
    result = merge_intervals(intervals)
    assert result == [(dt(10), dt(12))]

def test_merge_non_overlapping():
    intervals = [(dt(8), dt(9)), (dt(10), dt(11))]
    result = merge_intervals(intervals)
    assert result == [(dt(8), dt(9)), (dt(10), dt(11))]

def test_merge_empty():
    assert merge_intervals([]) == []

def test_merge_single():
    intervals = [(dt(9), dt(10))]
    assert merge_intervals(intervals) == [(dt(9), dt(10))]

def test_merge_multiple_overlapping():
    intervals = [(dt(8), dt(10)), (dt(9), dt(11)), (dt(10, 30), dt(12))]
    result = merge_intervals(intervals)
    assert result == [(dt(8), dt(12))]

def test_find_gaps_simple():
    busy = [(dt(10), dt(11))]
    gaps = find_gaps(dt(9), dt(12), busy)
    assert gaps == [(dt(9), dt(10)), (dt(11), dt(12))]

def test_find_gaps_no_busy():
    gaps = find_gaps(dt(9), dt(12), [])
    assert gaps == [(dt(9), dt(12))]

def test_find_gaps_fully_busy():
    busy = [(dt(8), dt(13))]
    gaps = find_gaps(dt(9), dt(12), busy)
    assert gaps == []

def test_find_gaps_busy_outside_window():
    busy = [(dt(6), dt(7)), (dt(14), dt(15))]
    gaps = find_gaps(dt(9), dt(12), busy)
    assert gaps == [(dt(9), dt(12))]

def test_find_gaps_busy_at_start():
    busy = [(dt(9), dt(10))]
    gaps = find_gaps(dt(9), dt(12), busy)
    assert gaps == [(dt(10), dt(12))]

def test_find_gaps_busy_at_end():
    busy = [(dt(11), dt(12))]
    gaps = find_gaps(dt(9), dt(12), busy)
    assert gaps == [(dt(9), dt(11))]

def test_find_gaps_multiple_busy():
    busy = [(dt(10), dt(11)), (dt(11, 30), dt(12, 30))]
    gaps = find_gaps(dt(9), dt(14), busy)
    assert gaps == [(dt(9), dt(10)), (dt(11), dt(11, 30)), (dt(12, 30), dt(14))]

def test_choose_slots_basic():
    gaps = [(dt(9), dt(12))]
    slots = choose_slots(gaps, duration_minutes=60, limit=3)
    assert slots == [(dt(9), dt(10)), (dt(10), dt(11)), (dt(11), dt(12))]

def test_choose_slots_respects_limit():
    gaps = [(dt(9), dt(17))]
    slots = choose_slots(gaps, duration_minutes=60, limit=3)
    assert len(slots) == 3

def test_choose_slots_gap_too_small():
    gaps = [(dt(9), dt(9, 30))]
    slots = choose_slots(gaps, duration_minutes=60, limit=5)
    assert slots == []

def test_choose_slots_exact_fit():
    gaps = [(dt(9), dt(10))]
    slots = choose_slots(gaps, duration_minutes=60, limit=5)
    assert slots == [(dt(9), dt(10))]

def test_choose_slots_multiple_gaps():
    gaps = [(dt(9), dt(10)), (dt(11), dt(13))]
    slots = choose_slots(gaps, duration_minutes=60, limit=5)
    assert (dt(9), dt(10)) in slots
    assert (dt(11), dt(12)) in slots
    assert (dt(12), dt(13)) in slots

def test_choose_slots_empty_gaps():
    assert choose_slots([], duration_minutes=60, limit=5) == []