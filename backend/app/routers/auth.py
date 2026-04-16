from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode
import os
import secrets

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.user import User
from app.schemas.user import UserCreate
from app.core.security import hash_password, verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register")
def register(payload: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        preferred_calendar=payload.preferred_calendar,
        timezone=payload.timezone,
        language=payload.language,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email}


@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return {"access_token": create_access_token(user.email), "token_type": "bearer"}


GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_LOGIN_REDIRECT_URI = os.getenv(
    "GOOGLE_LOGIN_REDIRECT_URI",
    "http://localhost:8000/auth/google/callback",
)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

GOOGLE_LOGIN_SCOPES = [
    "openid",
    "email",
    "profile",
]

GOOGLE_LOGIN_STATES: dict[str, datetime] = {}
GOOGLE_LOGIN_STATE_TTL_MINUTES = 10


def require_google_login_config():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_LOGIN_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Google login environment variables are not configured",
        )


def cleanup_google_login_states():
    now = datetime.now(timezone.utc)
    expired = [
        state
        for state, created_at in GOOGLE_LOGIN_STATES.items()
        if now - created_at > timedelta(minutes=GOOGLE_LOGIN_STATE_TTL_MINUTES)
    ]
    for state in expired:
        GOOGLE_LOGIN_STATES.pop(state, None)


def build_google_login_auth_url(state: str) -> str:
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_LOGIN_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(GOOGLE_LOGIN_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "select_account",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_google_login_code_for_tokens(code: str) -> dict:
    resp = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_LOGIN_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(
            status_code=400,
            detail=f"Google token exchange failed: {resp.text}",
        )
    return resp.json()


def fetch_google_userinfo(access_token: str) -> dict:
    resp = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(
            status_code=400,
            detail=f"Google userinfo failed: {resp.text}",
        )
    return resp.json()


@router.get("/google/login-url")
def google_login_url():
    require_google_login_config()
    cleanup_google_login_states()

    state = secrets.token_urlsafe(32)
    GOOGLE_LOGIN_STATES[state] = datetime.now(timezone.utc)

    return {"auth_url": build_google_login_auth_url(state)}


@router.get("/google/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    require_google_login_config()
    cleanup_google_login_states()

    if error:
        params = urlencode({"google": "error", "reason": error})
        return RedirectResponse(url=f"{FRONTEND_URL}/login?{params}")

    if not code or not state:
        params = urlencode({"google": "error", "reason": "missing_code_or_state"})
        return RedirectResponse(url=f"{FRONTEND_URL}/login?{params}")

    created_at = GOOGLE_LOGIN_STATES.pop(state, None)
    if not created_at:
        params = urlencode({"google": "error", "reason": "invalid_or_expired_state"})
        return RedirectResponse(url=f"{FRONTEND_URL}/login?{params}")

    token_data = exchange_google_login_code_for_tokens(code)
    access_token = token_data["access_token"]

    profile = fetch_google_userinfo(access_token)

    email = profile.get("email")
    email_verified = profile.get("email_verified", False)
    full_name = profile.get("name")
    google_sub = profile.get("sub")

    if not email or not email_verified:
        params = urlencode({"google": "error", "reason": "google_email_not_verified"})
        return RedirectResponse(url=f"{FRONTEND_URL}/login?{params}")

    user = db.query(User).filter(User.email == email).first()

    if not user:
        random_password = secrets.token_urlsafe(32)
        user = User(
            email=email,
            full_name=full_name or "Google User",
            preferred_calendar="gregorian",
            timezone="UTC",
            language="en",
            hashed_password=hash_password(random_password),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    user.google_email = email
    user.google_sub = google_sub
    user.google_access_token = token_data.get("access_token")
    user.google_refresh_token = token_data.get("refresh_token") or user.google_refresh_token
    user.google_token_scope = token_data.get("scope")

    expires_in = token_data.get("expires_in")
    if expires_in:
        user.google_token_expiry = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))

    db.commit()
    db.refresh(user)

    jwt_token = create_access_token(user.email)

    params = urlencode(
        {
            "token": jwt_token,
            "google": "success",
        }
    )
    return RedirectResponse(url=f"{FRONTEND_URL}/login?{params}")