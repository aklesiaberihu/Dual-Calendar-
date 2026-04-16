import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.event import Event
from app.models.user import User
from app.models.reminder_log import ReminderLog


REMINDER_POLL_SECONDS = 10


def utc_now():
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_smtp_settings():
    return {
        "host": os.getenv("SMTP_HOST", ""),
        "port": int(os.getenv("SMTP_PORT", "587")),
        "username": os.getenv("SMTP_USERNAME", ""),
        "password": os.getenv("SMTP_PASSWORD", ""),
        "from_email": os.getenv("SMTP_FROM", ""),
        "use_tls": os.getenv("SMTP_USE_TLS", "true").lower() == "true",
    }


def smtp_is_configured() -> bool:
    cfg = get_smtp_settings()
    return all(
        [
            cfg["host"],
            cfg["port"],
            cfg["username"],
            cfg["password"],
            cfg["from_email"],
        ]
    )


def send_email_reminder(to_email: str, event: Event):
    cfg = get_smtp_settings()

    subject = f"Reminder: {event.title}"
    start_utc = ensure_utc(event.start_time_utc)

    body = (
        f"Hello,\n\n"
        f"This is your reminder for the event:\n\n"
        f"Title: {event.title}\n"
        f"Description: {event.description or '—'}\n"
        f"Timezone: {event.timezone or 'UTC'}\n"
        f"Start (UTC): {start_utc.strftime('%Y-%m-%d %H:%M:%S UTC') if start_utc else '—'}\n"
        f"Reminder: {event.reminder_minutes} minute(s) before\n\n"
        f"Sent by DualCal."
    )

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["from_email"]
    msg["To"] = to_email
    msg.set_content(body)

    if cfg["use_tls"]:
        context = ssl.create_default_context()
        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(cfg["username"], cfg["password"])
            server.send_message(msg)
    else:
        with smtplib.SMTP(cfg["host"], cfg["port"]) as server:
            server.login(cfg["username"], cfg["password"])
            server.send_message(msg)


def reminder_already_logged(db: Session, event_id: int, recipient_email: str) -> bool:
    existing = (
        db.query(ReminderLog)
        .filter(
            ReminderLog.event_id == event_id,
            ReminderLog.recipient_email == recipient_email,
        )
        .first()
    )
    return existing is not None


def log_reminder_sent(db: Session, event_id: int, recipient_email: str):
    db.add(
        ReminderLog(
            event_id=event_id,
            recipient_email=recipient_email,
            sent_at=utc_now(),
        )
    )
    db.commit()


def fetch_candidate_events(db: Session, now_utc: datetime):
    window_start = now_utc - timedelta(minutes=2)
    window_end = now_utc + timedelta(days=7)

    return (
        db.query(Event)
        .filter(Event.start_time_utc.isnot(None))
        .filter(Event.reminder_minutes.isnot(None))
        .filter(Event.start_time_utc >= window_start)
        .filter(Event.start_time_utc <= window_end)
        .order_by(Event.start_time_utc.asc())
        .all()
    )


def process_reminders_once():
    db = SessionLocal()
    now_utc = utc_now()

    try:
        if not smtp_is_configured():
            print("[REMINDER] SMTP not configured; skipping cycle")
            return

        events = fetch_candidate_events(db, now_utc)

        for event in events:
            start_utc = ensure_utc(event.start_time_utc)
            if start_utc is None:
                continue

            reminder_minutes = event.reminder_minutes or 0
            reminder_time_utc = start_utc - timedelta(minutes=reminder_minutes)

            if not (reminder_time_utc <= now_utc < start_utc):
                continue

            user = db.query(User).filter(User.id == event.user_id).first()
            if not user or not user.email:
                print(f"[REMINDER ERROR] event_id={event.id} reason=user_missing")
                continue

            if reminder_already_logged(db, event.id, user.email):
                print(
                    f"[REMINDER SKIP] event_id={event.id} "
                    f"title={event.title} reason=already_logged"
                )
                continue

            print(
                f"[REMINDER MATCH] event_id={event.id} "
                f"title={event.title} "
                f"reminder_time={reminder_time_utc.isoformat()} "
                f"start_time={start_utc.isoformat()} "
                f"user_email={user.email}"
            )

            try:
                send_email_reminder(user.email, event)
                log_reminder_sent(db, event.id, user.email)
                print(
                    f"[REMINDER SENT] to={user.email} "
                    f"event_id={event.id} title={event.title}"
                )
            except Exception as e:
                db.rollback()
                print(f"[REMINDER EMAIL ERROR] event_id={event.id} error={e}")

    finally:
        db.close()


def reminder_loop():
    print("[REMINDER SYSTEM] startup")
    while True:
        try:
            process_reminders_once()
        except Exception as e:
            print(f"[REMINDER LOOP ERROR] {e}")
        time.sleep(REMINDER_POLL_SECONDS)