import asyncio
import os
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.event import Event
from app.models.user import User
from app.models.reminder_log import ReminderLog

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USERNAME)
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

def send_email_reminder(to_email: str, subject: str, body: str):
    if not SMTP_HOST or not SMTP_USERNAME or not SMTP_PASSWORD or not SMTP_FROM:
        raise RuntimeError("SMTP configuration is incomplete")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        if SMTP_USE_TLS:
            server.starttls()
        server.login(SMTP_USERNAME, SMTP_PASSWORD)
        server.send_message(msg)

def build_email_subject(event: Event) -> str:
    return f"Dual Calendar Reminder: {event.title}"

def build_email_body(event: Event, user: User) -> str:
    return (
        f"Hello {user.email},\n\n"
        f"This is your reminder for the event:\n\n"
        f"Title: {event.title}\n"
        f"Description: {event.description or '—'}\n"
        f"Start (UTC): {event.start_time_utc.isoformat()}\n"
        f"Timezone: {event.timezone or 'UTC'}\n"
        f"Reminder: {event.reminder_minutes} minute(s) before\n\n"
        f"Sent by Dual Calendar."
    )

def process_due_reminders_once():
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        print(f"[REMINDER CHECK] now_utc={now.isoformat()}", flush=True)

        events = db.query(Event).order_by(Event.start_time_utc.asc()).all()

        for event in events:
            if event.reminder_minutes is None:
                print(
                    f"[REMINDER SKIP] event_id={event.id} title={event.title} reason=no_reminder_minutes",
                    flush=True,
                )
                continue

            existing = (
                db.query(ReminderLog)
                .filter(ReminderLog.event_id == event.id)
                .first()
            )
            if existing:
                print(
                    f"[REMINDER SKIP] event_id={event.id} title={event.title} reason=already_logged sent_at={existing.sent_at}",
                    flush=True,
                )
                continue

            reminder_time = event.start_time_utc - timedelta(minutes=event.reminder_minutes)

            print(
                f"[REMINDER EVENT] event_id={event.id} title={event.title} "
                f"start_utc={event.start_time_utc.isoformat()} "
                f"reminder_minutes={event.reminder_minutes} "
                f"reminder_time_utc={reminder_time.isoformat()}",
                flush=True,
            )

            if reminder_time <= now < event.start_time_utc:
                user = db.query(User).filter(User.id == event.user_id).first()
                if not user:
                    print(
                        f"[REMINDER SKIP] event_id={event.id} title={event.title} reason=user_not_found",
                        flush=True,
                    )
                    continue

                print(
                    f"[REMINDER MATCH] event_id={event.id} title={event.title} "
                    f"reminder_time={reminder_time.isoformat()} "
                    f"start_time={event.start_time_utc.isoformat()} "
                    f"user_email={user.email}",
                    flush=True,
                )

                subject = build_email_subject(event)
                body = build_email_body(event, user)

                send_email_reminder(user.email, subject, body)

                print(
                    f"[REMINDER SENT] to={user.email} event_id={event.id} title={event.title}",
                    flush=True,
                )

                log = ReminderLog(
                    event_id=event.id,
                    recipient_email=user.email,
                )
                db.add(log)
                db.commit()

    except Exception as e:
        db.rollback()
        print(f"[REMINDER EMAIL ERROR] {e}", flush=True)
    finally:
        db.close()

async def reminder_loop():
    while True:
        process_due_reminders_once()
        await asyncio.sleep(10)