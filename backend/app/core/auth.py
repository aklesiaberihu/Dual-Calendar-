import os
from fastapi import Header, HTTPException
from jose import jwt, JWTError

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-secret")
ALGORITHM = "HS256"

def get_current_user_email(authorization: str = Header(...)) -> str:
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    token = parts[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise HTTPException(status_code=401, detail="Invalid token subject")
        return email
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
