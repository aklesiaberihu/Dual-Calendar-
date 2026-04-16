import pytest
from app.core.diff import diff_dicts


def test_diff_no_changes():
    old = {"title": "Meeting", "description": "Weekly"}
    new = {"title": "Meeting", "description": "Weekly"}
    result = diff_dicts(old, new)
    assert result["changes"] == []
    assert result["digest"] == "No changes"


def test_diff_one_change():
    old = {"title": "Meeting", "description": "Weekly"}
    new = {"title": "Standup", "description": "Weekly"}
    result = diff_dicts(old, new)
    assert len(result["changes"]) == 1
    assert result["changes"][0]["field"] == "title"
    assert result["changes"][0]["from"] == "Meeting"
    assert result["changes"][0]["to"] == "Standup"


def test_diff_multiple_changes():
    old = {"title": "Meeting", "description": "Weekly", "timezone": "UTC"}
    new = {"title": "Standup", "description": "Daily", "timezone": "UTC"}
    result = diff_dicts(old, new)
    assert len(result["changes"]) == 2
    fields = [c["field"] for c in result["changes"]]
    assert "title" in fields
    assert "description" in fields


def test_diff_digest_lists_changed_fields():
    old = {"title": "A", "description": "B"}
    new = {"title": "X", "description": "Y"}
    result = diff_dicts(old, new)
    assert "description" in result["digest"]
    assert "title" in result["digest"]


def test_diff_field_added():
    old = {"title": "Meeting"}
    new = {"title": "Meeting", "description": "New field"}
    result = diff_dicts(old, new)
    assert len(result["changes"]) == 1
    assert result["changes"][0]["field"] == "description"
    assert result["changes"][0]["from"] is None
    assert result["changes"][0]["to"] == "New field"


def test_diff_field_removed():
    old = {"title": "Meeting", "description": "To be removed"}
    new = {"title": "Meeting"}
    result = diff_dicts(old, new)
    assert len(result["changes"]) == 1
    assert result["changes"][0]["field"] == "description"
    assert result["changes"][0]["from"] == "To be removed"
    assert result["changes"][0]["to"] is None


def test_diff_empty_dicts():
    result = diff_dicts({}, {})
    assert result["changes"] == []
    assert result["digest"] == "No changes"


def test_diff_none_values():
    old = {"title": None}
    new = {"title": "Meeting"}
    result = diff_dicts(old, new)
    assert result["changes"][0]["from"] is None
    assert result["changes"][0]["to"] == "Meeting"


def test_diff_changes_sorted_alphabetically():
    old = {"z_field": "a", "a_field": "b"}
    new = {"z_field": "x", "a_field": "y"}
    result = diff_dicts(old, new)
    fields = [c["field"] for c in result["changes"]]
    assert fields == sorted(fields)