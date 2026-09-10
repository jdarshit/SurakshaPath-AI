from __future__ import annotations

import os
import smtplib
import traceback
from email.message import EmailMessage
from dotenv import load_dotenv
import re
import secrets
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

try:
    from backend.database import get_db
    from backend.models import User
except Exception:
    from database import get_db
    from models import User

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt_sha256", "bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

OTP_STORE: dict[str, dict[str, Any]] = {}
OTP_LOCK = Lock()
OTP_TTL_MINUTES = int(os.getenv("OTP_TTL_MINUTES", "5"))
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "24"))


class SendOTPRequest(BaseModel):
    email: str
    name: str | None = None
    phone: str | None = None
    password: str | None = None
    guardian_name: str | None = None
    guardian_phone: str | None = None
    guardian_whatsapp: str | None = None
    guardian_relation: str | None = None


class VerifyOTPRequest(BaseModel):
    email: str
    otp: str


class GuardianUpdateRequest(BaseModel):
    guardian_name: str | None = None
    guardian_whatsapp: str | None = None
    guardian_relation: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


def generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_jwt_token(user_id: int | str, email: str) -> str:
    issued_at = _utcnow()
    expires_at = issued_at + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {
        "user_id": str(user_id),
        "email": email,
        # Use numeric timestamps for JWT claims
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "phone": user.phone,
        "guardian_name": user.guardian_name,
        "guardian_phone": user.guardian_phone,
        "guardian_relation": user.guardian_relation,
    }


def _cleanup_expired_otps() -> None:
    now = _utcnow()
    expired = [email for email, payload in OTP_STORE.items() if payload["expires_at"] <= now]
    for email in expired:
        OTP_STORE.pop(email, None)


def _store_otp(email: str, otp: str, expires_at: datetime) -> None:
    with OTP_LOCK:
        _cleanup_expired_otps()
        OTP_STORE[email] = {"otp": otp, "expires_at": expires_at}


def _get_otp_entry(email: str) -> dict[str, Any] | None:
    with OTP_LOCK:
        _cleanup_expired_otps()
        return OTP_STORE.get(email)


def _clear_otp(email: str) -> None:
    with OTP_LOCK:
        OTP_STORE.pop(email, None)


# Ensure dotenv is loaded early so os.getenv reads values from backend/.env
load_dotenv()


def _sanitize_env(value: str | None) -> str | None:
    if value is None:
        return None
    v = value.strip()
    # strip surrounding single or double quotes if present
    if (v.startswith("\"") and v.endswith("\"")) or (v.startswith("'") and v.endswith("'")):
        v = v[1:-1]
    return v.strip()


def send_otp_email(
        to_email: str,
        otp: str) -> tuple:
    smtp_server = _sanitize_env(os.getenv("SMTP_SERVER")) or "smtp.gmail.com"
    smtp_port = int(_sanitize_env(os.getenv("SMTP_PORT")) or "587")
    smtp_email = _sanitize_env(os.getenv("SMTP_EMAIL"))
    smtp_password = _sanitize_env(os.getenv("SMTP_PASSWORD"))

    if not smtp_email or not smtp_password:
        return False, "SMTP_EMAIL and SMTP_PASSWORD are not configured"

    try:
        message = EmailMessage()
        message["From"] = smtp_email
        message["To"] = to_email
        message["Subject"] = "SurakshaPath AI - OTP Verification"
        message.set_content(
            f"Your OTP for SurakshaPath AI is:\n\n"
            f"{otp}\n\n"
            f"Valid for {OTP_TTL_MINUTES} minutes.\n"
            "Do not share it with anyone.\n\n"
            "SurakshaPath AI\n"
            "Surakshit Raasta, Smart Faisla"
        )

        with smtplib.SMTP(smtp_server, smtp_port, timeout=20) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(message)

        print(f"✅ OTP sent to {to_email}")
        return True, "OTP sent"

    except Exception as e:
        print(f"⚠️ SMTP failed: {type(e).__name__}: {e}")
        return False, str(e)


@router.post("/send-otp")
def send_otp(payload: SendOTPRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not _is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email format")

    # Prevent registering an already-registered email
    try:
        existing = db.query(User).filter(User.email == email).first()
    except Exception:
        existing = None
    if existing and existing.password_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    otp = generate_otp()
    expires_at = _utcnow() + timedelta(minutes=OTP_TTL_MINUTES)
    _store_otp(email, otp, expires_at)

    if payload.name or payload.phone or payload.password or payload.guardian_name or payload.guardian_phone or payload.guardian_relation:
        with OTP_LOCK:
            # Allow frontend to send guardian_whatsapp (alias) or guardian_phone
            guardian_phone = payload.guardian_phone or payload.guardian_whatsapp
            OTP_STORE[email]["profile"] = {
                "name": payload.name,
                "phone": payload.phone,
                "password_hash": hash_password(payload.password) if payload.password else None,
                "guardian_name": payload.guardian_name,
                "guardian_phone": guardian_phone,
                "guardian_relation": payload.guardian_relation,
            }

    print(f"[AUTH] OTP generated for {email}: {otp} (expires at {expires_at.isoformat()})")

    email_sent, msg = send_otp_email(
        email, str(otp))

    if not email_sent and os.getenv("DEMO_MODE", "false").strip().lower() not in {"1", "true", "yes"}:
        _clear_otp(email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to send OTP email: {msg}",
        )

    response_data = {
        "status": "success",
        "message": "OTP sent to your email",
        "expires_in_seconds": 300
    }

    if os.getenv("DEMO_MODE") == "true":
        response_data["otp"] = str(otp)
        response_data["note"] = (
            "Demo mode: OTP shown here")

    return response_data


@router.get("/test-email")
def test_email(to: str | None = None):
    """Send a real test OTP email through SendGrid."""
    recipient = (to or _sanitize_env(os.getenv("SMTP_EMAIL")) or "").strip().lower()
    otp = generate_otp()

    email_result = send_otp_email(recipient, otp)
    if len(email_result) == 2:
        success, message = email_result
        tb = None
    else:
        success, message, tb = email_result
    if not success:
        return {
            "status": "error",
            "message": message,
            "traceback": tb,
        }

    return {"status": "success", "message": "Test OTP sent", "to": recipient}


@router.post("/verify-otp")
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not _is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email format")
    # Demo bypass: in DEMO_MODE skip strict OTP matching to simplify demos/tests
    demo_mode = os.getenv("DEMO_MODE", "false").strip().lower() in {"1", "true", "yes"}

    entry = _get_otp_entry(email)
    if not entry and not demo_mode:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP not found or expired")

    if not demo_mode:
        expires_at = entry["expires_at"]
        if expires_at <= _utcnow():
            _clear_otp(email)
            print(f"[auth] OTP expired for {email}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired")

        if entry["otp"] != payload.otp.strip():
            print(f"[auth] Invalid OTP attempt for {email}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP")

    profile = entry.get("profile") or {}
    user = None
    if profile.get("name") or profile.get("password_hash") or profile.get("guardian_name") or profile.get("guardian_phone") or profile.get("guardian_relation"):
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                name=profile.get("name") or email.split("@")[0],
                email=email,
                phone=profile.get("phone"),
                password_hash=profile.get("password_hash"),
                guardian_name=profile.get("guardian_name"),
                guardian_phone=profile.get("guardian_phone"),
                guardian_relation=profile.get("guardian_relation"),
                is_active=True,
                is_verified=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            changed = False
            if profile.get("password_hash"):
                user.password_hash = profile["password_hash"]
                user.is_active = True
                user.is_verified = True
                changed = True
            if profile.get("name"):
                user.name = profile["name"]
                changed = True
            if profile.get("phone"):
                user.phone = profile["phone"]
                changed = True
            if profile.get("guardian_name"):
                user.guardian_name = profile["guardian_name"]
                changed = True
            if profile.get("guardian_phone"):
                user.guardian_phone = profile["guardian_phone"]
                changed = True
            if profile.get("guardian_relation"):
                user.guardian_relation = profile["guardian_relation"]
                changed = True
            if changed:
                db.commit()
                db.refresh(user)

    _clear_otp(email)
    print(f"[auth] OTP verified for {email}")

    response = {
        "status": "success",
        "message": "OTP verified successfully",
    }
    if user is not None:
        response["token"] = create_jwt_token(user.id, user.email)
        response["user"] = serialize_user(user)
        response["message"] = "Registration successful"
    return response


@router.post("/register")
def register(payload: SendOTPRequest, db: Session = Depends(get_db)):
    """Direct registration endpoint (skips OTP). Useful for demo or simple signups.

    Returns a JWT token on success and standard messages used by the frontend.
    """
    email = (payload.email or "").strip().lower()
    if not _is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email format")
    if not payload.password or len(payload.password) < 6:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.email == email).first()
    if existing and existing.password_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    password_hash = hash_password(payload.password) if payload.password else None

    user = User(
        name=payload.name or (email.split("@")[0] if email else None),
        email=email,
        phone=payload.phone,
        password_hash=password_hash,
        guardian_name=payload.guardian_name,
        guardian_phone=payload.guardian_phone,
        guardian_relation=payload.guardian_relation,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_jwt_token(user.id, user.email)
    return {"status": "success", "message": "Registration successful", "token": token, "user": serialize_user(user)}


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    if not _is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email format")

    user = db.query(User).filter(User.email == email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid credentials")

    token = create_jwt_token(user.id, user.email)
    print(f"[auth] Password login succeeded for {email}")
    return {
        "status": "success",
        "message": "Login successful",
        "token": token,
        "user": serialize_user(user),
    }


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user_id = payload.get("user_id")
    email = payload.get("email")
    if not user_id or not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id), User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    if credentials is None:
        return None

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None

    user_id = payload.get("user_id")
    email = payload.get("email")
    if not user_id or not email:
        return None

    return db.query(User).filter(User.id == int(user_id), User.email == email).first()


@router.put("/guardian")
async def update_guardian(
    payload: GuardianUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    print(f"[AUTH] Guardian update for user {current_user.id}")
    print(f"[AUTH] Payload: {payload}")
    
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    changed = False
    
    if payload.guardian_name is not None:
        name = payload.guardian_name.strip()
        if name:
            user.guardian_name = name
            changed = True
            print(f"[AUTH] Updated guardian name to: {name}")

    if payload.guardian_whatsapp is not None:
        number = str(payload.guardian_whatsapp or "")
        number = number.replace(" ", "").replace("+", "").replace("-", "").replace("(", "").replace(")", "")
        # Ensure only digits
        number = ''.join(c for c in number if c.isdigit())
        
        if len(number) == 10:
            number = "91" + number
        elif not number.startswith("91") and len(number) > 10:
            # Remove leading zeros if any
            number = number.lstrip('0')
            if len(number) == 10:
                number = "91" + number
        
        if number and len(number) >= 12:  # At least 91 + 10 digits
            user.guardian_phone = number
            changed = True
            print(f"[AUTH] Updated guardian phone to: {number}")
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid phone number format. Got: {number}")

    if payload.guardian_relation is not None:
        relation = payload.guardian_relation.strip()
        if relation:
            user.guardian_relation = relation
            changed = True
            print(f"[AUTH] Updated guardian relation to: {relation}")

    if changed:
        db.commit()
        db.refresh(user)
        print(f"[AUTH] Guardian details saved successfully")
    else:
        print(f"[AUTH] No changes made")
    
    return {
        "success": True,
        "message": "Guardian updated successfully",
        "guardian_name": user.guardian_name,
        "guardian_whatsapp": user.guardian_phone,
        "guardian_relation": user.guardian_relation,
    }


@router.get("/profile")
def profile(current_user: User = Depends(get_current_user)):
    return {
        "status": "success",
        "user": serialize_user(current_user),
        "email": current_user.email,
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "status": "success",
        "user": serialize_user(current_user),
    }
