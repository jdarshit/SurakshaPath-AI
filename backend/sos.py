from datetime import datetime
import os
from pathlib import Path
from urllib.parse import quote
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import aiohttp

try:
    from backend.auth import get_current_user_optional
    from backend.database import get_db
    from backend.models import SOSAlert, User
    from backend.ws_manager import manager
except Exception:
    from auth import get_current_user_optional
    from database import get_db
    from models import SOSAlert, User
    from ws_manager import manager

router = APIRouter()

# Ensure backend .env variables are loaded when this module is imported directly.
env_path = Path(__file__).resolve().parent / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=str(env_path))


class SOSRequest(BaseModel):
    lat: float = Field(..., example=22.7196, description="Latitude coordinate")
    lng: float = Field(..., example=75.8577, description="Longitude coordinate")
    source: str = Field("app", example="app", description="Source of the alert")
    message: str | None = Field(None, example="I need help immediately", description="Optional message to store with the alert")
    user_id: int | None = Field(None, example=1, description="Optional user ID to associate with the alert")

    class Config:
        schema_extra = {
            "example": {
                "lat": 22.7196,
                "lng": 75.8577,
                "source": "app",
                "message": "Emergency help needed at this location.",
                "user_id": 1,
            }
        }


class SOSListResponse(BaseModel):
    id: int
    user_id: int | None
    lat: float
    lng: float
    source: str
    message: str | None
    status: str
    triggered_at: datetime
    resolved_at: datetime | None


def _format_whatsapp_phone(phone: str | None) -> str | None:
    if not phone:
        return None
    digits = ''.join(ch for ch in str(phone) if ch.isdigit())
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]
    if digits.startswith('91') and len(digits) == 12:
        return digits
    if len(digits) == 10:
        return '91' + digits
    if len(digits) > 12 and digits.startswith('91'):
        return digits[-12:]
    if len(digits) > 10:
        return '91' + digits[-10:]
    return None


def _sanitize_env(value: str | None) -> str | None:
    if value is None:
        return None
    sanitized = value.strip()
    if (sanitized.startswith('"') and sanitized.endswith('"')) or (sanitized.startswith("'") and sanitized.endswith("'")):
        sanitized = sanitized[1:-1]
    return sanitized.strip()


async def _send_whatsapp_text(phone: str, message: str) -> tuple[bool, str]:
    whatsapp_phone_id = _sanitize_env(os.getenv('WHATSAPP_PHONE_ID'))
    whatsapp_access_token = _sanitize_env(os.getenv('WHATSAPP_ACCESS_TOKEN'))

    if not whatsapp_phone_id or not whatsapp_access_token:
        return False, 'WHATSAPP_PHONE_ID or WHATSAPP_ACCESS_TOKEN is not configured.'

    url = f"https://graph.facebook.com/v18.0/{whatsapp_phone_id}/messages"
    headers = {
        'Authorization': f'Bearer {whatsapp_access_token}',
        'Content-Type': 'application/json',
    }
    payload = {
        'messaging_product': 'whatsapp',
        'to': phone,
        'type': 'text',
        'text': {
            'preview_url': False,
            'body': message,
        },
    }
    print(f"[SOS] WhatsApp payload: phone={phone}, url={url}")
    print(f"[SOS] WhatsApp config: phone_id={whatsapp_phone_id}, token_loaded={bool(whatsapp_access_token)}")

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload, headers=headers) as resp:
                text = await resp.text()
                if resp.status in [200, 201]:
                    return True, text
                error_note = ' Authentication may have failed; check WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_ID.' if resp.status == 401 else ''
                return False, f'{resp.status} - {text}{error_note}'
    except Exception as exc:
        return False, str(exc)


def _build_whatsapp_link(phone: str, message: str) -> str:
    """Build a wa.me deep link that opens WhatsApp with a pre-filled message.

    Unlike the Meta Business Cloud API, this cannot send silently, but it
    always works — no access token, phone-number-ID, or approved message
    template is required. The frontend opens this via window.open() so the
    user just taps Send.
    """
    return f"https://wa.me/{phone}?text={quote(message)}"


async def send_guardian_notification(guardian_phone: str, message: str, lat: float, lng: float):
    """Send WhatsApp notification to guardian via WhatsApp Cloud API or fallback."""
    phone = _format_whatsapp_phone(guardian_phone)
    if not phone:
        print("⚠️ No valid guardian phone configured for SOS notification")
        return False
    
    try:
        # Format message with location
        location_url = f"https://maps.google.com/?q={lat},{lng}"
        final_message = message or "🚨 EMERGENCY SOS ALERT 🚨\n\nThe user has triggered an emergency alert and needs immediate assistance!"
        formatted_message = f"{final_message}\n\n📍 Location: {location_url}"
        
        # Try WhatsApp Business API (Meta Cloud API)
        whatsapp_phone_id = _sanitize_env(os.getenv('WHATSAPP_PHONE_ID'))
        whatsapp_access_token = _sanitize_env(os.getenv('WHATSAPP_ACCESS_TOKEN'))
        
        if whatsapp_phone_id and whatsapp_access_token:
            success, result = await _send_whatsapp_text(phone, formatted_message)
            if success:
                print(f"✅ WhatsApp SOS sent to {phone} - response: {result}")
                return True
            print(f"⚠️ WhatsApp API error: {result}")
            return False

        # Fallback: Try alternative WhatsApp API endpoint or log for manual setup
        whatsapp_api = _sanitize_env(os.getenv('WHATSAPP_API_URL'))
        whatsapp_key = _sanitize_env(os.getenv('WHATSAPP_API_KEY'))
        if whatsapp_api and whatsapp_key:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    whatsapp_api,
                    json={
                        'phone': phone,
                        'message': formatted_message,
                    },
                    headers={'Authorization': f'Bearer {whatsapp_key}'}
                ) as resp:
                    if resp.status == 200:
                        print(f"✅ WhatsApp SOS sent to {phone}")
                        return True
                    error_text = await resp.text()
                    print(f"⚠️ WhatsApp API error: {resp.status} - {error_text}")
                    return False

        # Fallback: Log the message (requires WhatsApp credentials setup)
        print(f"📱 ⚠️ SOS ALERT - No WhatsApp API configured")
        print(f"📞 Guardian Phone: {phone}")
        print(f"📍 Message: {formatted_message}")
        print("⚠️ Please set WHATSAPP_PHONE_ID and WHATSAPP_ACCESS_TOKEN environment variables for WhatsApp integration")
        return False
    except Exception as e:
        print(f"❌ Error sending guardian notification: {e}")
        return False


@router.post("/trigger")
async def trigger_sos(
    payload: SOSRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    if payload.source not in {"app", "iot", "manual"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source must be app, iot or manual")

    user_id = current_user.id if current_user else payload.user_id
    sos_alert = SOSAlert(
        user_id=user_id,
        lat=payload.lat,
        lng=payload.lng,
        source=payload.source,
        message=payload.message,
        status="active",
    )

    db.add(sos_alert)
    db.commit()
    db.refresh(sos_alert)

    await manager.broadcast({
        "type": "SOS_ALERT",
        "data": {
            "id": sos_alert.id,
            "user_id": sos_alert.user_id,
            "lat": sos_alert.lat,
            "lng": sos_alert.lng,
            "source": sos_alert.source,
            "message": sos_alert.message,
            "status": sos_alert.status,
            "triggered_at": sos_alert.triggered_at.isoformat() if sos_alert.triggered_at else None,
        },
    })

    notification_status = None
    whatsapp_url = None
    message_text = payload.message or "🚨 EMERGENCY SOS ALERT 🚨\n\nThe user has triggered an emergency alert and needs immediate assistance!"

    # The alert is already saved and broadcast above — that's the critical
    # part. Guardian notification is best-effort and must NEVER fail the
    # request: a flaky/unconfigured WhatsApp Business API token should not
    # make the app report "SOS failed" when the alert actually went through.
    if current_user:
        formatted_phone = _format_whatsapp_phone(current_user.guardian_phone)
        if formatted_phone:
            location_url = f"https://maps.google.com/?q={payload.lat},{payload.lng}"
            full_message = f"{message_text}\n\n📍 Location: {location_url}"

            # Best-effort: try silent server-side delivery via Meta's Cloud
            # API (works only with a verified business + approved template
            # + active token). Never raises — failures just fall through to
            # the wa.me link below.
            print(f"[SOS] Attempting WhatsApp Cloud API delivery to {formatted_phone}")
            sent_silently = await send_guardian_notification(
                current_user.guardian_phone, message_text, payload.lat, payload.lng
            )
            notification_status = 'sent' if sent_silently else 'link_ready'

            # Always provide the wa.me link too — it's the reliable path:
            # the frontend opens it and the user taps Send. This works
            # regardless of whether the Cloud API attempt above succeeded.
            whatsapp_url = _build_whatsapp_link(formatted_phone, full_message)
        else:
            notification_status = 'missing_guardian'
            print(f"[SOS] ⚠️ User {current_user.id} has no guardian phone configured")
    else:
        notification_status = 'unauthenticated'
        print("[SOS] ⚠️ No authenticated user for SOS trigger")

    return {
        "status": "success",
        "alert": {
            "id": sos_alert.id,
            "user_id": sos_alert.user_id,
            "lat": sos_alert.lat,
            "lng": sos_alert.lng,
            "source": sos_alert.source,
            "message": sos_alert.message,
            "status": sos_alert.status,
            "triggered_at": sos_alert.triggered_at,
            "resolved_at": sos_alert.resolved_at,
        },
        "notification_status": notification_status,
        "whatsapp_url": whatsapp_url,
    }


class WhatsAppTestRequest(BaseModel):
    phone: str = Field(..., example="919876543210", description="Phone number to test WhatsApp delivery")
    message: str | None = Field(None, example="WhatsApp test message", description="Optional test message body")


@router.post('/test-config')
async def test_whatsapp_config(payload: WhatsAppTestRequest):
    phone = _format_whatsapp_phone(payload.phone)
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='Invalid phone number format')

    test_message = payload.message or 'SurakshaPath AI WhatsApp configuration test message.'
    location_url = 'https://maps.google.com'
    formatted_message = f"{test_message}\n\n📍 {location_url}"

    success, result = await _send_whatsapp_text(phone, formatted_message)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f'WhatsApp config test failed: {result}. Ensure WHATSAPP_PHONE_ID and WHATSAPP_ACCESS_TOKEN are correct and not expired.',
        )

    return {
        'status': 'success',
        'message': 'WhatsApp config is valid and message was sent successfully',
        'phone': phone,
        'whatsapp_phone_id': _sanitize_env(os.getenv('WHATSAPP_PHONE_ID')),
        'response': result,
    }


@router.get("/active")
def get_active_sos(db: Session = Depends(get_db)):
    alerts = (
        db.query(SOSAlert)
        .filter(SOSAlert.status == "active")
        .order_by(SOSAlert.triggered_at.desc())
        .all()
    )

    return {
        "status": "success",
        "alerts": [
            {
                "id": alert.id,
                "user_id": alert.user_id,
                "lat": alert.lat,
                "lng": alert.lng,
                "source": alert.source,
                "message": alert.message,
                "status": alert.status,
                "triggered_at": alert.triggered_at,
                "resolved_at": alert.resolved_at,
            }
            for alert in alerts
        ],
    }


@router.get('/whatsapp-config')
async def whatsapp_config():
    """Return whether WhatsApp env vars are present and whether the access token is valid."""
    whatsapp_phone_id = _sanitize_env(os.getenv('WHATSAPP_PHONE_ID'))
    whatsapp_access_token = _sanitize_env(os.getenv('WHATSAPP_ACCESS_TOKEN'))

    result = {
        'whatsapp_phone_id_present': bool(whatsapp_phone_id),
        'whatsapp_access_token_present': bool(whatsapp_access_token),
        'valid': False,
        'detail': None,
    }

    if not whatsapp_access_token:
        result['detail'] = 'WHATSAPP_ACCESS_TOKEN not configured'
        return result

    # Perform a lightweight Graph API call to validate token (do not expose token)
    try:
        url = 'https://graph.facebook.com/v18.0/me'
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params={'access_token': whatsapp_access_token}) as resp:
                text = await resp.text()
                result['status_code'] = resp.status
                if resp.status == 200:
                    result['valid'] = True
                    result['detail'] = 'Access token appears valid'
                else:
                    result['valid'] = False
                    result['detail'] = text
    except Exception as e:
        result['valid'] = False
        result['detail'] = str(e)

    return result


@router.get('/debug-token-info')
async def debug_token_info():
    """
    DEBUG ENDPOINT: Return masked token info to verify runtime values vs .env file.
    Shows: token length, first 8 chars, last 8 chars, phone ID.
    Also reports which .env file is loaded and whether OS env vars override it.
    """
    whatsapp_phone_id = _sanitize_env(os.getenv('WHATSAPP_PHONE_ID'))
    whatsapp_access_token = _sanitize_env(os.getenv('WHATSAPP_ACCESS_TOKEN'))
    
    # Check which .env file is being used
    env_path = Path(__file__).resolve().parent / '.env'
    env_exists = env_path.exists()
    
    # Try to read the current .env file to compare with runtime values
    env_file_token = None
    env_file_phone_id = None
    if env_exists:
        try:
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith('WHATSAPP_ACCESS_TOKEN='):
                        env_file_token = line.split('=', 1)[1].strip()
                    elif line.startswith('WHATSAPP_PHONE_ID='):
                        env_file_phone_id = line.split('=', 1)[1].strip()
        except Exception as e:
            env_file_token = f"Error reading .env: {e}"
            env_file_phone_id = f"Error reading .env: {e}"
    
    # Mask token for display (show first 8 and last 8)
    def mask_token(token):
        if not token or len(token) < 16:
            return f"<{len(token) if token else 0} chars>"
        return f"{token[:8]}...{token[-8:]}"
    
    return {
        "env_file_path": str(env_path),
        "env_file_exists": env_exists,
        "runtime_phone_id": whatsapp_phone_id,
        "runtime_token_length": len(whatsapp_access_token) if whatsapp_access_token else 0,
        "runtime_token_masked": mask_token(whatsapp_access_token),
        "env_file_phone_id": env_file_phone_id,
        "env_file_token_length": len(env_file_token) if env_file_token and isinstance(env_file_token, str) and not env_file_token.startswith("Error") else "N/A",
        "env_file_token_masked": mask_token(env_file_token) if isinstance(env_file_token, str) and not env_file_token.startswith("Error") else env_file_token,
        "tokens_match": whatsapp_access_token == env_file_token if isinstance(env_file_token, str) and not env_file_token.startswith("Error") else "N/A",
        "os_env_override_check": {
            "WHATSAPP_ACCESS_TOKEN_in_os": bool(os.environ.get('WHATSAPP_ACCESS_TOKEN')),
            "WHATSAPP_PHONE_ID_in_os": bool(os.environ.get('WHATSAPP_PHONE_ID')),
        },
        "note": "If tokens_match is False, the runtime token differs from .env file. Check if OS environment variables override .env or if backend needs restart."
    }


@router.patch("/{alert_id}/resolve")
def resolve_sos(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(SOSAlert).filter(SOSAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SOS alert not found")

    alert.status = "resolved"
    alert.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(alert)

    return {
        "status": "success",
        "alert": {
            "id": alert.id,
            "user_id": alert.user_id,
            "lat": alert.lat,
            "lng": alert.lng,
            "source": alert.source,
            "message": alert.message,
            "status": alert.status,
            "triggered_at": alert.triggered_at,
            "resolved_at": alert.resolved_at,
        },
    }
