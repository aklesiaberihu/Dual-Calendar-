import pytest
from datetime import datetime
from app.core.ranking import in_work_hours, slot_conflicts_for_user, rank_slots

def dt(hour, minute=0):
    return datetime(2025, 1, 1, hour, minute)

def test_in_work_hours_true():
    assert in_work_hours(dt(10), 9, 17) is True

def test_in_work_hours_at_start():
    assert in_work_hours(dt(9), 9, 17) is True

def test_in_work_hours_at_end_boundary():
    assert in_work_hours(dt(17), 9, 17) is False

def test_in_work_hours_before():
    assert in_work_hours(dt(7), 9, 17) is False

def test_in_work_hours_after():
    assert in_work_hours(dt(20), 9, 17) is False

def test_slot_conflicts_true():
    busy = [(dt(10), dt(11))]
    slot = (dt(10, 30), dt(11, 30))
    assert slot_conflicts_for_user(busy, slot) is True

def test_slot_conflicts_false():
    busy = [(dt(10), dt(11))]
    slot = (dt(11), dt(12))
    assert slot_conflicts_for_user(busy, slot) is False

def test_slot_conflicts_no_busy():
    assert slot_conflicts_for_user([], (dt(10), dt(11))) is False

def test_slot_conflicts_contained():
    busy = [(dt(9), dt(13))]
    slot = (dt(10), dt(11))
    assert slot_conflicts_for_user(busy, slot) is True

def test_rank_slots_ideal():
    slots = [(dt(10), dt(11))]
    result = rank_slots(
        slots=slots,
        busy_by_user={},
        required_users=set(),
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert len(result) == 1
    assert result[0]["score"] == 0
    assert result[0]["reasons"] == ["Everyone free, within work hours"]

def test_rank_slots_required_user_busy_excluded():
    slots = [(dt(10), dt(11))]
    busy_by_user = {1: [(dt(10), dt(11))]}
    result = rank_slots(
        slots=slots,
        busy_by_user=busy_by_user,
        required_users={1},
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result == []

def test_rank_slots_optional_user_busy_penalised():
    slots = [(dt(10), dt(11))]
    busy_by_user = {2: [(dt(10), dt(11))]}
    result = rank_slots(
        slots=slots,
        busy_by_user=busy_by_user,
        required_users=set(),
        optional_users={2},
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result[0]["score"] == 100

def test_rank_slots_outside_work_hours_penalised():
    slots = [(dt(20), dt(21))]
    result = rank_slots(
        slots=slots,
        busy_by_user={},
        required_users=set(),
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result[0]["score"] == 50

def test_rank_slots_sorted_by_score():
    slots = [(dt(20), dt(21)), (dt(10), dt(11))]
    result = rank_slots(
        slots=slots,
        busy_by_user={},
        required_users=set(),
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result[0]["score"] <= result[1]["score"]

def test_rank_slots_in_work_hours_is_ideal():
    slots = [(dt(9), dt(10)), (dt(15), dt(16))]
    result = rank_slots(
        slots=slots,
        busy_by_user={},
        required_users=set(),
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result[0]["score"] == 0
    assert result[0]["start"] == dt(9)

def test_rank_slots_rating_ideal():
    slots = [(dt(10), dt(11))]
    result = rank_slots(
        slots=slots,
        busy_by_user={},
        required_users=set(),
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result[0]["rating"] == "⭐⭐⭐⭐⭐ IDEAL"

def test_rank_slots_rating_poor():
    slots = [(dt(20), dt(21))]
    busy_by_user = {2: [(dt(20), dt(21))], 3: [(dt(20), dt(21))], 4: [(dt(20), dt(21))]}
    result = rank_slots(
        slots=slots,
        busy_by_user=busy_by_user,
        required_users=set(),
        optional_users={2, 3, 4},
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result[0]["score"] == 350
    assert result[0]["rating"] == "⭐⭐ FAIR"

def test_rank_slots_all_required_any_busy_excluded():
    slots = [(dt(10), dt(11))]
    busy_by_user = {1: [(dt(10), dt(11))], 2: []}
    result = rank_slots(
        slots=slots,
        busy_by_user=busy_by_user,
        required_users={1, 2},
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )
    assert result == []
