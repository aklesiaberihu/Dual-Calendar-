from pydantic import BaseModel, EmailStr
from typing import Literal

Role = Literal["editor", "viewer"]

class ShareEventIn(BaseModel):
    email: EmailStr
    role: Role = "viewer"

class ParticipantOut(BaseModel):
    user_id: int
    email: EmailStr
    role: str

    class Config:
        from_attributes = True
