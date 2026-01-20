from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.db.session import Base

class EventSnapshot(Base):
    __tablename__ = "event_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)

    version = Column(Integer, nullable=False)

    title = Column(String, nullable=False)
    description = Column(String, nullable=True)

    start_time_utc = Column(String, nullable=False)
    end_time_utc = Column(String, nullable=True)

    timezone = Column(String, nullable=False)
    reminder_minutes = Column(Integer, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
