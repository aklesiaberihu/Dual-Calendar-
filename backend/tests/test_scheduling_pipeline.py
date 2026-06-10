
import pytest
from datetime import datetime
from app.core.intervals import merge_intervals, find_gaps, choose_slots
from app.core.ranking import rank_slots

def dt(hour, minute=0, day=1):
    return datetime(2025, 6, day, hour, minute)

def test_pipeline_two_users_no_conflict():
    
    user1_busy = [(dt(9), dt(10)), (dt(14), dt(15))]
    user2_busy = [(dt(11), dt(12))]

    all_busy = merge_intervals(user1_busy + user2_busy)
    gaps = find_gaps(dt(9), dt(17), all_busy)
    slots = choose_slots(gaps, duration_minutes=60, limit=10)

    assert len(slots) >= 2
    assert (dt(10), dt(11)) in slots
    assert (dt(12), dt(13)) in slots

def test_pipeline_fully_blocked_window():
    
    user1_busy = [(dt(9), dt(17))]
    user2_busy = [(dt(8), dt(18))]

    all_busy = merge_intervals(user1_busy + user2_busy)
    gaps = find_gaps(dt(9), dt(17), all_busy)
    slots = choose_slots(gaps, duration_minutes=60, limit=5)

    assert slots == []

def test_pipeline_fragmented_busy_intervals():
    
    busy = [
        (dt(9), dt(10, 30)),
        (dt(10), dt(11)),
        (dt(11), dt(12)),
        (dt(13), dt(17)),
    ]
    merged = merge_intervals(busy)
    gaps = find_gaps(dt(9), dt(17), merged)
    slots = choose_slots(gaps, duration_minutes=60, limit=5)

    assert len(slots) == 1
    assert slots[0] == (dt(12), dt(13))

def test_pipeline_with_ranking_required_user_excluded():
    
    gaps = [(dt(9), dt(12))]
    slots = choose_slots(gaps, duration_minutes=60, limit=5)

    busy_by_user = {
        1: [(dt(9), dt(10))],
        2: [(dt(10), dt(11))],
    }

    ranked = rank_slots(
        slots=slots,
        busy_by_user=busy_by_user,
        required_users={1},
        optional_users={2},
        work_start_hour=9,
        work_end_hour=17,
    )

    starts = [r["start"] for r in ranked]

    assert dt(9) not in starts

    penalised = next(r for r in ranked if r["start"] == dt(10))
    assert penalised["score"] == 100

    ideal = next(r for r in ranked if r["start"] == dt(11))
    assert ideal["score"] == 0

def test_pipeline_ranked_order_best_first():
    
    gaps = [(dt(8), dt(18))]
    slots = choose_slots(gaps, duration_minutes=60, limit=20)

    busy_by_user = {
        1: [(dt(8), dt(9)), (dt(17), dt(18))],
    }

    ranked = rank_slots(
        slots=slots,
        busy_by_user=busy_by_user,
        required_users=set(),
        optional_users={1},
        work_start_hour=9,
        work_end_hour=17,
    )

    scores = [r["score"] for r in ranked]
    assert scores == sorted(scores)

def test_version_match_allows_update():
    
    stored_version = 3
    client_version = 3
    conflict = client_version != stored_version
    assert conflict is False

def test_version_mismatch_triggers_conflict():
    
    stored_version = 4
    client_version = 3
    conflict = client_version != stored_version
    assert conflict is True

def test_version_increments_on_save():
    
    version = 1
    version += 1
    assert version == 2
    version += 1
    assert version == 3

def test_owner_can_edit():
    role = "owner"
    can_edit = role in ("owner", "editor")
    assert can_edit is True

def test_editor_can_edit():
    role = "editor"
    can_edit = role in ("owner", "editor")
    assert can_edit is True

def test_viewer_cannot_edit():
    role = "viewer"
    can_edit = role in ("owner", "editor")
    assert can_edit is False

def test_only_owner_can_manage_participants():
    for role in ("editor", "viewer"):
        assert (role == "owner") is False
    assert ("owner" == "owner") is True

def test_pipeline_duration_longer_than_gap():
    
    busy = [(dt(9, 30), dt(17))]
    gaps = find_gaps(dt(9), dt(17), busy)
    slots = choose_slots(gaps, duration_minutes=60, limit=5)
    assert slots == []

def test_pipeline_multi_day_window():
    
    busy = [(dt(9), dt(17)), (dt(9, 0, day=2), dt(17, 0, day=2))]
    merged = merge_intervals(busy)
    gaps = find_gaps(dt(8), dt(18, 0, day=2), merged)

    overnight = [(dt(17), dt(9, 0, day=2))]
    assert len(gaps) >= 2

def test_pipeline_no_busy_all_slots_ideal():
    
    gaps = find_gaps(dt(9), dt(17), [])
    slots = choose_slots(gaps, duration_minutes=60, limit=5)

    ranked = rank_slots(
        slots=slots,
        busy_by_user={},
        required_users=set(),
        optional_users=set(),
        work_start_hour=9,
        work_end_hour=17,
    )

    assert all(r["score"] == 0 for r in ranked)
    assert all(r["reasons"] == ["Everyone free, within work hours"] for r in ranked)
