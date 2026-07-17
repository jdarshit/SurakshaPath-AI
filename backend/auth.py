from __future__ import annotations

import os
import traceback
from dotenv import load_dotenv
import re
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from smtplib import SMTPAuthenticationError, SMTPConnectError, SMTPException, SMTPNotSupportedError
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

pwd_context = CryptContext(schemes=["bcrypt_sha256"], deprecated="auto")
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
        "iat": issued_at,
        "exp": expires_at,
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


def _normalize_smtp_password(value: str | None) -> str | None:
    if value is None:
        return None
    sanitized = _sanitize_env(value)
    if sanitized is None:
        return None
    # Gmail app passwords are often displayed with spaces for readability.
    return ''.join(ch for ch in sanitized if not ch.isspace())


def _mask_password(pw: str | None) -> str:
    if pw is None:
        return "<None>"
    if len(pw) <= 4:
        return "*" * len(pw)
    head = pw[:2]
    tail = pw[-2:]
    middle = "*" * (len(pw) - 4)
    return f"{head}{middle}{tail}"


def send_otp_email(recipient_email: str, otp: str) -> tuple[bool, str, str | None]:
    """
    Send OTP email via Gmail SMTP with detailed logging and error handling.
    Returns (success: bool, message: str, traceback: str|None)
    """
    tb_str: str | None = None
    try:
        # Load SMTP configuration from environment (ensure dotenv was loaded earlier)
        smtp_server_raw = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port_raw = os.getenv("SMTP_PORT", "587")
        smtp_user_raw = os.getenv("SMTP_EMAIL")
        smtp_password_raw = os.getenv("SMTP_PASSWORD")

        print("[AUTH] Loading SMTP config")

        smtp_server = _sanitize_env(smtp_server_raw) or "smtp.gmail.com"
        smtp_port = int(_sanitize_env(smtp_port_raw) or "587")
        smtp_user = _sanitize_env(smtp_user_raw)
        smtp_password = _normalize_smtp_password(smtp_password_raw)

        # Debug prints for validation
        print(f"[AUTH] SMTP host: {smtp_server}")
        print(f"[AUTH] SMTP port: {smtp_port}")

        # Print masked password repr for debugging
        print(f"[AUTH] SMTP_PASSWORD repr: '{_mask_password(smtp_password)}'")

        # Check for common misconfigurations
        if smtp_server.lower() != "smtp.gmail.com":
            print(f"[AUTH WARNING] SMTP_SERVER expected 'smtp.gmail.com' but got '{smtp_server}'")
        if smtp_port != 587:
            print(f"[AUTH WARNING] SMTP_PORT expected 587 but got {smtp_port}")

        # Validate configuration
        if not smtp_user:
            error_msg = "SMTP_EMAIL not configured"
            print(f"[AUTH ERROR] {error_msg}")
            return False, error_msg, None

        if not smtp_password:
            error_msg = "SMTP_PASSWORD not configured"
            print(f"[AUTH ERROR] {error_msg}")
            return False, error_msg, None

        # Prepare email message
        message = EmailMessage()
        message["Subject"] = "SurakshaPath AI - OTP Verification"
        message["From"] = smtp_user
        message["To"] = recipient_email
        message.set_content(
            f"Your One-Time Password (OTP) for SurakshaPath AI is:\n\n{otp}\n\n"
            f"This code will expire in {OTP_TTL_MINUTES} minutes.\n\n"
            f"Do not share this code with anyone.\n\n"
            f"Best regards,\nSurakshaPath AI Team"
        )

        print("[AUTH] Opening SMTP connection")
        try:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=15)
        except Exception as e:
            tb_str = traceback.format_exc()
            error_msg = f"Failed to open SMTP connection: {str(e)}"
            print(f"[AUTH ERROR] {error_msg}")
            print(tb_str)
            return False, error_msg, tb_str

        try:
            with server:
                print("[AUTH] Starting TLS")
                try:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                except Exception as e:
                    tb_str = traceback.format_exc()
                    error_msg = f"TLS start failed: {str(e)}"
                    print(f"[AUTH ERROR] {error_msg}")
                    print(tb_str)
                    return False, error_msg, tb_str

                print("[AUTH] Logging into Gmail")
                try:
                    server.login(smtp_user, smtp_password)
                    print("[AUTH] Login success")
                except Exception as e:
                    tb_str = traceback.format_exc()
                    error_msg = f"SMTP login failed: {str(e)}"
                    print(f"[AUTH ERROR] {error_msg}")
                    print(tb_str)
                    return False, error_msg, tb_str

                print("[AUTH] Sending message")
                try:
                    server.send_message(message)
                except Exception as e:
                    tb_str = traceback.format_exc()
                    error_msg = f"Failed to send email: {str(e)}"
                    print(f"[AUTH ERROR] {error_msg}")
                    print(tb_str)
                    return False, error_msg, tb_str

                print("[AUTH] Email sent successfully")
                return True, "OTP sent successfully", None

        except Exception as e:
            tb_str = traceback.format_exc()
            error_msg = f"SMTP server error: {str(e)}"
            print(f"[AUTH ERROR] {error_msg}")
            print(tb_str)
            return False, error_msg, tb_str

    except Exception as e:
        tb_str = traceback.format_exc()
        error_msg = f"Critical error in OTP email sender: {str(e)}"
        print(f"[AUTH ERROR] {error_msg}")
        print(tb_str)
        return False, error_msg, tb_str


@router.post("/send-otp")
def send_otp(payload: SendOTPRequest):
    email = payload.email.strip().lower()
    if not _is_valid_email(email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email format")

    otp = generate_otp()
    expires_at = _utcnow() + timedelta(minutes=OTP_TTL_MINUTES)
    _store_otp(email, otp, expires_at)

    if payload.name or payload.phone or payload.password or payload.guardian_name or payload.guardian_phone or payload.guardian_relation:
        with OTP_LOCK:
            OTP_STORE[email]["profile"] = {
                "name": payload.name,
                "phone": payload.phone,
                "password_hash": hash_password(payload.password) if payload.password else None,
                "guardian_name": payload.guardian_name,
                "guardian_phone": payload.guardian_phone,
                "guardian_relation": payload.guardian_relation,
            }

    print(f"[AUTH] OTP generated for {email}: {otp} (expires at {expires_at.isoformat()})")

    # Send OTP email
    success, error_message, tb = send_otp_email(email, otp)
    if not success:
        # OTP was stored but email failed - return error with details and traceback
        print(f"[AUTH ERROR] send_otp failed: {error_message}")
        if tb:
            print(tb)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to send OTP email: {error_message}",
        )

    response = {
        "status": "success",
        "message": "OTP sent successfully",
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
    }

    if os.getenv("OTP_DEBUG", "false").strip().lower() in {"1", "true", "yes"}:
        response["otp"] = otp
        print(f"[AUTH DEBUG] Returning OTP in response for {email}")

    return response


@router.get("/test-email")
def test_email(to: str | None = None):
    """Send a real test OTP email and return detailed SMTP runtime info."""
    # Load raw envs to validate
    smtp_user_raw = os.getenv("SMTP_EMAIL")
    smtp_password_raw = os.getenv("SMTP_PASSWORD")
    smtp_server_raw = os.getenv("SMTP_SERVER")
    smtp_port_raw = os.getenv("SMTP_PORT")

    smtp_user = _sanitize_env(smtp_user_raw)
    smtp_password = _sanitize_env(smtp_password_raw)
    smtp_server = _sanitize_env(smtp_server_raw) or "smtp.gmail.com"
    smtp_port = int(_sanitize_env(smtp_port_raw) or "587")

    print("[AUTH] /auth/test-email invoked")
    print(f"[AUTH] SMTP_EMAIL loaded: {smtp_user is not None}")
    print(f"[AUTH] SMTP_PASSWORD loaded: {smtp_password is not None}")
    print(f"[AUTH] SMTP_SERVER == smtp.gmail.com: {smtp_server.lower() == 'smtp.gmail.com'}")
    print(f"[AUTH] SMTP_PORT == 587: {smtp_port == 587}")
    print(f"[AUTH] SMTP_PASSWORD repr: '{_mask_password(smtp_password)}'")

    if not smtp_user or not smtp_password:
        return {
            "status": "error",
            "message": "SMTP_EMAIL or SMTP_PASSWORD not configured",
            "smtp_email": smtp_user,
            "smtp_password_repr": _mask_password(smtp_password),
        }

    recipient = to or smtp_user
    otp = generate_otp()

    success, message, tb = send_otp_email(recipient, otp)
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

    entry = _get_otp_entry(email)
    if not entry:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP not found or expired")

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
    return response


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
