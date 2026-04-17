import pytest
from app.core.security import hash_password, verify_password, create_access_token
from jose import jwt

SECRET_KEY = "change-this-secret"
ALGORITHM = "HS256"

def test_hash_password_returns_string():
    hashed = hash_password("mypassword")
    assert isinstance(hashed, str)

def test_hash_password_is_not_plaintext():
    hashed = hash_password("mypassword")
    assert hashed != "mypassword"

def test_verify_password_correct():
    hashed = hash_password("mypassword")
    assert verify_password("mypassword", hashed) is True

def test_verify_password_wrong():
    hashed = hash_password("mypassword")
    assert verify_password("wrongpassword", hashed) is False

def test_hash_same_password_different_hashes():
    hash1 = hash_password("mypassword")
    hash2 = hash_password("mypassword")
    assert hash1 != hash2

def test_create_access_token_returns_string():
    token = create_access_token("test@example.com")
    assert isinstance(token, str)

def test_create_access_token_contains_subject():
    token = create_access_token("test@example.com")
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert payload["sub"] == "test@example.com"

def test_create_access_token_has_expiry():
    token = create_access_token("test@example.com")
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    assert "exp" in payload