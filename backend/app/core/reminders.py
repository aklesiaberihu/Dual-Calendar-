import asyncio
import os
import logging
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.event import Event
from app.models.user import User
from app.models.reminder_log import ReminderLog

logger = logging.getLogger(__name__)

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
        logger.debug("Reminder check now_utc=%s", now.isoformat())

        events = db.query(Event).order_by(Event.start_time_utc.asc()).all()

        for event in events:
            if event.reminder_minutes is None:
                logger.debug("Reminder skipped: event_id=%s title=%s reason=no_reminder_minutes", event.id, event.title)
                continue

            existing = (
                db.query(ReminderLog)
                .filter(ReminderLog.event_id == event.id)
                .first()
            )
            if existing:
                logger.debug("Reminder skipped: event_id=%s title=%s reason=already_logged sent_at=%s", event.id, event.title, existing.sent_at)
                continue

            reminder_time = event.start_time_utc - timedelta(minutes=event.reminder_minutes)

            logger.debug("Reminder event: event_id=%s title=%s start_utc=%s reminder_minutes=%s reminder_time_utc=%s",
                        event.id, event.title, event.start_time_utc.isoformat(), event.reminder_minutes, reminder_time.isoformat())

            if reminder_time <= now < event.start_time_utc:
                user = db.query(User).filter(User.id == event.user_id).first()
                if not user:
                    logger.error("Reminder skipped: event_id=%s title=%s reason=user_not_found", event.id, event.title)
                    continue

                logger.info("Reminder matched: event_id=%s title=%s reminder_time=%s start_time=%s user_email=%s",
                           event.id, event.title, reminder_time.isoformat(), event.start_time_utc.isoformat(), user.email)

                subject = build_email_subject(event)
                body = build_email_body(event, user)

                send_email_reminder(user.email, subject, body)

                logger.info("Reminder sent: to=%s event_id=%s title=%s", user.email, event.id, event.title)

                log = ReminderLog(
                    event_id=event.id,
                    recipient_email=user.email,
                )
                db.add(log)
                db.commit()

    except Exception as e:
        db.rollback()
        logger.error("Reminder email error: %s", e)
    finally:
        db.close()

async def reminder_loop():
    while True:
        process_due_reminders_once()
        await asyncio.sleep(10)