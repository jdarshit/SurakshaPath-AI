from datetime import timedelta
from datetime import datetime, timezone

from fastapi.testclient import TestClient

import backend.auth as auth
from backend.main import app


def run_tests() -> None:
    sent_messages: list[tuple[str, str]] = []

    def fake_send_otp_email(recipient_email: str, otp: str) -> tuple[bool, str]:
        sent_messages.append((recipient_email, otp))
        return True, "OTP sent successfully"

    auth.send_otp_email = fake_send_otp_email

    client = TestClient(app)

    email = "user@gmail.com"

    print("[test] sending OTP")
    response = client.post("/auth/send-otp", json={"email": email})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "success"
    assert email in auth.OTP_STORE
    assert len(sent_messages) == 1

    generated_otp = auth.OTP_STORE[email]["otp"]
    assert generated_otp == sent_messages[0][1]
    assert len(generated_otp) == 6 and generated_otp.isdigit()

    print("[test] verifying OTP")
    response = client.post("/auth/verify-otp", json={"email": email, "otp": generated_otp})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "success"
    assert email not in auth.OTP_STORE

    print("[test] invalid OTP")
    response = client.post("/auth/send-otp", json={"email": email})
    assert response.status_code == 200, response.text
    response = client.post("/auth/verify-otp", json={"email": email, "otp": "000000"})
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "Invalid OTP"

    print("[test] expired OTP")
    response = client.post("/auth/send-otp", json={"email": email})
    assert response.status_code == 200, response.text
    auth.OTP_STORE[email]["expires_at"] = auth.OTP_STORE[email]["expires_at"] - timedelta(minutes=10)
    expired_otp = auth.OTP_STORE[email]["otp"]
    response = client.post("/auth/verify-otp", json={"email": email, "otp": expired_otp})
    assert response.status_code == 400, response.text
    assert response.json()["detail"] in {"OTP expired", "OTP not found or expired"}

    print("[test] registration flow")
    register_email = f"surakshapath.{int(datetime.now(timezone.utc).timestamp())}@gmail.com"
    response = client.post(
        "/auth/send-otp",
        json={
            "email": register_email,
            "name": "Demo User",
            "phone": "9999999999",
            "password": "SecurePass123",
        },
    )
    assert response.status_code == 200, response.text
    register_otp = auth.OTP_STORE[register_email]["otp"]
    response = client.post("/auth/verify-otp", json={"email": register_email, "otp": register_otp})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "success"
    assert payload.get("token")
    assert payload.get("user", {}).get("email") == register_email

    print("[test] all OTP checks passed")


if __name__ == "__main__":
    run_tests()
