import pytest
from unittest.mock import MagicMock
from datetime import datetime
from app.core.reminders import build_email_subject, build_email_body


def make_mock_event(title, description, start_time, timezone, reminder_minutes):
    event = MagicMock()
    event.title = title
    event.description = description
    event.start_time_utc = start_time
    event.timezone = timezone
    event.reminder_minutes = reminder_minutes
    return event


def make_mock_user(email):
    user = MagicMock()
    user.email = email
    return user


def test_build_email_subject():
    event = make_mock_event("Team Meeting", None, datetime(2025, 6, 1, 10), "UTC", 60)
    subject = build_email_subject(event)
    assert subject == "Dual Calendar Reminder: Team Meeting"


def test_build_email_subject_includes_title():
    event = make_mock_event("Ethiopian New Year", None, datetime(2025, 9, 11, 8), "UTC", 30)
    subject = build_email_subject(event)
    assert "Ethiopian New Year" in subject


def test_build_email_body_contains_user_email():
    event = make_mock_event("Standup", "Daily sync", datetime(2025, 6, 1, 9), "UTC", 15)
    user = make_mock_user("aklesia@example.com")
    body = build_email_body(event, user)
    assert "aklesia@example.com" in body


def test_build_email_body_contains_event_title():
    event = make_mock_event("Standup", "Daily sync", datetime(2025, 6, 1, 9), "UTC", 15)
    user = make_mock_user("aklesia@example.com")
    body = build_email_body(event, user)
    assert "Standup" in body


def test_build_email_body_contains_reminder_minutes():
    event = make_mock_event("Standup", "Daily sync", datetime(2025, 6, 1, 9), "UTC", 30)
    user = make_mock_user("aklesia@example.com")
    body = build_email_body(event, user)
    assert "30" in body


def test_build_email_body_no_description_shows_dash():
    event = make_mock_event("No Desc Event", None, datetime(2025, 6, 1, 9), "UTC", 60)
    user = make_mock_user("aklesia@example.com")
    body = build_email_body(event, user)
    assert "—" in body


def test_build_email_body_contains_timezone():
    event = make_mock_event("Meeting", "desc", datetime(2025, 6, 1, 9), "Europe/Rome", 60)
    user = make_mock_user("aklesia@example.com")
    body = build_email_body(event, user)
    assert "Europe/Rome" in body