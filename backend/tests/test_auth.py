import pytest
from datetime import datetime, timedelta
from fastapi import HTTPException
from jose import jwt
from app.core.auth import get_current_user_email

SECRET_KEY = "change-this-secret"
ALGORITHM = "HS256"

def make_token(subject: str, expired: bool = False):
    if expired:
        expire = datetime.utcnow() - timedelta(minutes=10)
    else:
        expire = datetime.utcnow() + timedelta(minutes=60)
    return jwt.encode({"sub": subject, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def test_valid_token_returns_email():
    token = make_token("test@example.com")
    email = get_current_user_email(authorization=f"Bearer {token}")
    assert email == "test@example.com"

def test_expired_token_raises_401():
    token = make_token("test@example.com", expired=True)
    with pytest.raises(HTTPException) as exc:
        get_current_user_email(authorization=f"Bearer {token}")
    assert exc.value.status_code == 401

def test_invalid_token_raises_401():
    with pytest.raises(HTTPException) as exc:
        get_current_user_email(authorization="Bearer notavalidtoken")
    assert exc.value.status_code == 401

def test_missing_bearer_prefix_raises_401():
    token = make_token("test@example.com")
    with pytest.raises(HTTPException) as exc:
        get_current_user_email(authorization=token)
    assert exc.value.status_code == 401

def test_wrong_header_format_raises_401():
    with pytest.raises(HTTPException) as exc:
        get_current_user_email(authorization="Basic sometoken")
    assert exc.value.status_code == 401