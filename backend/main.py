from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading

from app import models
from app.db.session import Base, engine, SessionLocal
from app.routers import auth, profile, events, conversion, diff, holidays, google
from app.routers import scheduling
from app.core.seed_holidays import seed_default_holidays
from app.services.reminder_service import reminder_loop

Base.metadata.create_all(bind=engine)

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
app.include_router(holidays.router)
app.include_router(google.router)