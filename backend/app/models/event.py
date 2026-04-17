from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.session import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(Integer, nullable=False, default=1)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    start_time_utc = Column(DateTime(timezone=False), nullable=False)
    end_time_utc = Column(DateTime(timezone=False), nullable=True)

    timezone = Column(String(64), default="UTC")
    reminder_minutes = Column(Integer, default=60)

    created_at = Column(DateTime(timezone=False), server_default=func.now())
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())

    user = relationship("User", backref="events")
