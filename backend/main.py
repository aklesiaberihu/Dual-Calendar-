from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

from app import models
from app.db.session import Base, engine, SessionLocal
from app.routers import auth, profile, events, conversion, diff, holidays, google
from app.routers import scheduling
from app.routers.scheduling import schedule_router
from app.core.seed_holidays import seed_default_holidays
from app.services.reminder_service import reminder_loop

Base.metadata.create_all(bind=engine)

def _apply_migrations():
    from sqlalchemy import text, inspect as sa_inspect
    inspector = sa_inspect(engine)
    existing = {col["name"] for col in inspector.get_columns("events")}
    new_cols = [
        ("recurrence_group_id", "VARCHAR(36)"),
        ("recurrence_rule",     "VARCHAR(16)"),
        ("recurrence_interval", "INTEGER"),
        ("recurrence_byday",    "VARCHAR(64)"),
    ]
    with engine.connect() as conn:
        for col, defn in new_cols:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE events ADD COLUMN {col} {defn}"))
                logging.getLogger(__name__).info("Migration: added column events.%s", col)

        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_events_recurrence_group_id "
            "ON events (recurrence_group_id)"
        ))
        conn.commit()

try:
    _apply_migrations()
except Exception as exc:
    logging.getLogger(__name__).warning("Migration skipped: %s", exc)

db = SessionLocal()
try:
    seed_default_holidays(db)
finally:
    db.close()

app = FastAPI(title="Dual Calendar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

reminder_thread = None

@app.on_event("startup")
def startup_event():
    global reminder_thread
    if reminder_thread is None or not reminder_thread.is_alive():
        reminder_thread = threading.Thread(target=reminder_loop, daemon=True)
        reminder_thread.start()

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(events.router)
app.include_router(conversion.router)
app.include_router(diff.router)
app.include_router(scheduling.router)
app.include_router(schedule_router)
app.include_router(holidays.router)
app.include_router(google.router)