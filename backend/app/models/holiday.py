from sqlalchemy import Column, Integer, String, Date, DateTime, func
from app.db.session import Base


class Holiday(Base):
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(255), nullable=False)
    category = Column(String(50), nullable=False, default="public")
    calendar_type = Column(String(20), nullable=False)  # gregorian | ethiopian

    g_year = Column(Integer, nullable=True)
    g_month = Column(Integer, nullable=True)
    g_day = Column(Integer, nullable=True)

    e_year = Column(Integer, nullable=True)
    e_month = Column(Integer, nullable=True)
    e_day = Column(Integer, nullable=True)

    resolved_date = Column(Date, nullable=False, index=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now())
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), onupdate=func.now())