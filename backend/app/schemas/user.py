from pydantic import BaseModel, EmailStr
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    preferred_calendar: str = "gregorian"
    timezone: str = "UTC"
    language: str = "en"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    preferred_calendar: Optional[str] = None
    timezone: Optional[str] = None
    language: Optional[str] = None

class UserOut(UserBase):
    id: int
    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: str
    password: str
    class Config:
        from_attributes = True
