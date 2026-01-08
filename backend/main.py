from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import models so SQLAlchemy registers tables before create_all
from app import models  # noqa: F401

from app.db.session import Base, engine
from app.routers import auth, profile, events

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Dual Calendar API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(events.router)
