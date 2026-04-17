from sqlalchemy import Column, Integer, DateTime, ForeignKey, func, String
from app.db.session import Base

class ReminderLog(Base):
    __tablename__ = "reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    recipient_email = Column(String(255), nullable=False)
    sent_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)