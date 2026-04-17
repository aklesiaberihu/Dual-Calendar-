import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from zoneinfo import ZoneInfo

from app.core.auth import get_current_user_email
from app.db.session import get_db
from app.models.event import Event
from app.models.event_participant import EventParticipant
from app.models.user import User

router = APIRouter(prefix="/google", tags=["google"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/google/callback")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"
GOOGLE_CALENDAR_EVENT_INSERT_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
]

REQUIRED_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"

def require_google_config():
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth environment variables are not configured",
        )

def get_current_user(db: Session, email: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def get_event_with_access(db: Session, user: User, event_id: int):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    if event.user_id == user.id:
        return event

    participant = (
        db.query(EventParticipant)
        .filter(
            EventParticipant.event_id == event_id,
            EventParticipant.user_id == user.id,
        )
        .first()
    )
    if not participant:
        raise HTTPException(status_code=403, detail="You do not have access to this event")

    return event

def ensure_google_connected(user: User):
    if not user.google_access_token:
        raise HTTPException(status_code=400, detail="Google Calendar is not connected")

def ensure_calendar_scope(user: User):
    """
    Check that the stored token actually includes the calendar.events scope.
    If not, the user connected Google before calendar permission was granted
    and must disconnect + reconnect to re-consent.
    """
    scope = user.google_token_scope or ""
    if REQUIRED_CALENDAR_SCOPE not in scope:
        raise HTTPException(
            status_code=400,
            detail=(
                "Google Calendar permission was not granted. "
                "Please disconnect and reconnect Google in Settings to allow calendar access."
            ),
        )

def build_google_auth_url(state: str):
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent select_account",
        "state": state,
    }
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    print("[GOOGLE CONNECT REQUESTED SCOPES]", params["scope"])
    print("[GOOGLE CONNECT URL]", auth_url)
    return auth_url

def exchange_code_for_tokens(code: str):
    resp = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(status_code=400, detail=f"Google token exchange failed: {resp.text}")
    return resp.json()

def refresh_google_access_token(user: User, db: Session):
    if not user.google_refresh_token:
        raise HTTPException(
            status_code=401,
            detail="Google refresh token is missing. Please reconnect Google Calendar.",
        )

    resp = requests.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "refresh_token": user.google_refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(status_code=401, detail=f"Google token refresh failed: {resp.text}")

    data = resp.json()
    print("[GOOGLE REFRESH TOKEN RESPONSE]", data)
    print("[GOOGLE REFRESH TOKEN RESPONSE SCOPE]", data.get("scope"))

    user.google_access_token = data["access_token"]
    expires_in = int(data.get("expires_in", 3600))
    user.google_token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
    if data.get("scope"):
        user.google_token_scope = data["scope"]

    db.commit()
    db.refresh(user)
    return user.google_access_token

def get_valid_google_access_token(user: User, db: Session):
    ensure_google_connected(user)

    if not user.google_token_expiry:
        return user.google_access_token

    now = datetime.utcnow()
    if user.google_token_expiry <= now + timedelta(minutes=1):
        return refresh_google_access_token(user, db)

    return user.google_access_token

def fetch_google_userinfo(access_token: str):
    resp = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=20,
    )
    if not resp.ok:
        raise HTTPException(status_code=400, detail=f"Google userinfo failed: {resp.text}")
    return resp.json()

def utc_naive_to_rfc3339_in_timezone(utc_dt, timezone_str: str):
    tz = ZoneInfo(timezone_str or "UTC")
    local_dt = utc_dt.replace(tzinfo=timezone.utc).astimezone(tz)
    return local_dt.isoformat()

@router.get("/status")
def google_status(
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    user = get_current_user(db, email)
    has_calendar_scope = REQUIRED_CALENDAR_SCOPE in (user.google_token_scope or "")
    return {
        "connected": bool(user.google_access_token),
        "has_calendar_scope": has_calendar_scope,
        "google_email": user.google_email,
        "google_sub": user.google_sub,
        "google_connected_at": user.google_connected_at.isoformat() if user.google_connected_at else None,
        "google_token_expiry": user.google_token_expiry.isoformat() if user.google_token_expiry else None,
        "google_token_scope": user.google_token_scope,
    }

@router.post("/connect-url")
def google_connect_url(
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    require_google_config()
    user = get_current_user(db, email)

    state = secrets.token_urlsafe(32)
    user.google_oauth_state = state
    db.commit()

    return {"auth_url": build_google_auth_url(state)}

@router.get("/callback")
def google_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    require_google_config()

    if error:
        return RedirectResponse(url=f"{FRONTEND_URL}?google=error&reason={error}")

    if not code or not state:
        return RedirectResponse(url=f"{FRONTEND_URL}?google=error&reason=missing_code_or_state")

    user = db.query(User).filter(User.google_oauth_state == state).first()
    if not user:
        return RedirectResponse(url=f"{FRONTEND_URL}?google=error&reason=invalid_state")

    token_data = exchange_code_for_tokens(code)
    print("[GOOGLE TOKEN RESPONSE]", token_data)
    print("[GOOGLE TOKEN RESPONSE SCOPE]", token_data.get("scope"))

    access_token = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    expires_in = int(token_data.get("expires_in", 3600))
    scope = token_data.get("scope", "")

    if REQUIRED_CALENDAR_SCOPE not in scope:
        print("[GOOGLE WARNING] calendar.events scope was NOT granted. Export will not work.")

    profile = fetch_google_userinfo(access_token)

    user.google_access_token = access_token
    if refresh_token:
        user.google_refresh_token = refresh_token
    user.google_token_expiry = datetime.utcnow() + timedelta(seconds=expires_in)
    user.google_token_scope = scope
    user.google_email = profile.get("email")
    user.google_sub = profile.get("sub")
    user.google_connected_at = datetime.utcnow()
    user.google_oauth_state = None

    db.commit()

    if REQUIRED_CALENDAR_SCOPE not in scope:
        return RedirectResponse(url=f"{FRONTEND_URL}?google=connected&calendar_scope=missing")

    return RedirectResponse(url=f"{FRONTEND_URL}?google=connected&calendar_scope=granted")

@router.post("/disconnect")
def google_disconnect(
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    require_google_config()
    user = get_current_user(db, email)

    if user.google_access_token:
        requests.post(
            GOOGLE_REVOKE_URL,
            params={"token": user.google_access_token},
            headers={"content-type": "application/x-www-form-urlencoded"},
            timeout=20,
        )

    user.google_email = None
    user.google_sub = None
    user.google_access_token = None
    user.google_refresh_token = None
    user.google_token_expiry = None
    user.google_token_scope = None
    user.google_oauth_state = None
    user.google_connected_at = None

    db.commit()

    return {"disconnected": True}

@router.post("/export-event/{event_id}")
def export_event_to_google(
    event_id: int,
    db: Session = Depends(get_db),
    email: str = Depends(get_current_user_email),
):
    require_google_config()
    user = get_current_user(db, email)
    event = get_event_with_access(db, user, event_id)

    access_token = get_valid_google_access_token(user, db)
    ensure_calendar_scope(user)

    print("[GOOGLE EXPORT STORED SCOPE]", user.google_token_scope)

    start_utc = event.start_time_utc
    end_utc = event.end_time_utc or (event.start_time_utc + timedelta(hours=1))

    payload = {
        "summary": event.title,
        "description": event.description or "",
        "start": {
            "dateTime": utc_naive_to_rfc3339_in_timezone(start_utc, event.timezone),
            "timeZone": event.timezone or "UTC",
        },
        "end": {
            "dateTime": utc_naive_to_rfc3339_in_timezone(end_utc, event.timezone),
            "timeZone": event.timezone or "UTC",
        },
    }

    print("[GOOGLE EXPORT PAYLOAD]", payload)

    resp = requests.post(
        GOOGLE_CALENDAR_EVENT_INSERT_URL,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=20,
    )

    print("[GOOGLE EXPORT STATUS]", resp.status_code)
    print("[GOOGLE EXPORT RESPONSE BODY]", resp.text)

    if not resp.ok:
        raise HTTPException(status_code=400, detail=f"Google Calendar export failed: {resp.text}")

    data = resp.json()
    return {
        "exported": True,
        "google_event_id": data.get("id"),
        "google_html_link": data.get("htmlLink"),
    }