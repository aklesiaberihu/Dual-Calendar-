from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserOut, UserUpdate
from app.core.auth import get_current_user_email

router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("", response_model=UserOut)
def get_profile(db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("", response_model=UserOut)
def update_profile(payload: UserUpdate, db: Session = Depends(get_db), email: str = Depends(get_current_user_email)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(user, k, v)

    db.commit()
    db.refresh(user)
    return user
