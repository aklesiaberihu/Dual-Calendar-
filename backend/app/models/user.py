from sqlalchemy import Column, Integer, String, DateTime, func
from app.db.session import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    full_name = Column(String(255))

    preferred_calendar = Column(String(20), default="gregorian")
    timezone = Column(String(64), default="UTC")
    language = Column(String(32), default="en")

    hashed_password = Column(String(255), nullable=False)

    google_email = Column(String(255), nullable=True)
    google_sub = Column(String(255), nullable=True, index=True)
    google_access_token = Column(String(2048), nullable=True)
    google_refresh_token = Column(String(2048), nullable=True)
    google_token_expiry = Column(DateTime, nullable=True)
    google_token_scope = Column(String(2048), nullable=True)
    google_oauth_state = Column(String(255), nullable=True)
    google_connected_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())