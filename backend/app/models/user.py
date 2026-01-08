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

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
