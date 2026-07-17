"""
Test script to validate Gmail SMTP configuration without sending emails.
Run this to debug OTP sending issues.
"""
import os
import smtplib
import sys
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(dotenv_path=env_path)

print("\n" + "="*70)
print("SMTP CONFIGURATION VALIDATION TEST")
print("="*70 + "\n")

# Load configuration
smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
smtp_port = int(os.getenv("SMTP_PORT", "587"))
smtp_user = os.getenv("SMTP_EMAIL")
smtp_password = os.getenv("SMTP_PASSWORD")

# Validate configuration
print("[TEST] Checking SMTP configuration variables...")

if not smtp_user:
    print("[ERROR] SMTP_EMAIL is not configured in .env file")
    sys.exit(1)
else:
    print(f"[OK] SMTP_EMAIL: {smtp_user}")

if not smtp_password:
    print("[ERROR] SMTP_PASSWORD is not configured in .env file")
    sys.exit(1)
else:
    print(f"[OK] SMTP_PASSWORD: {'*' * len(smtp_password)} (length: {len(smtp_password)})")

print(f"[OK] SMTP_SERVER: {smtp_server}")
print(f"[OK] SMTP_PORT: {smtp_port}")

print("\n[TEST] Testing SMTP connection and authentication...\n")

try:
    print(f"[AUTH] Connecting to {smtp_server}:{smtp_port}...")
    server = smtplib.SMTP(smtp_server, smtp_port, timeout=15)
    print("[OK] Connection established")

    print("[AUTH] Sending initial EHLO...")
    server.ehlo()
    print("[OK] EHLO sent")

    print("[AUTH] Starting TLS encryption...")
    server.starttls()
    print("[OK] TLS encryption enabled")

    print("[AUTH] Sending EHLO after TLS...")
    server.ehlo()
    print("[OK] EHLO after TLS sent")

    print(f"[AUTH] Attempting to login with {smtp_user}...")
    server.login(smtp_user, smtp_password)
    print("[OK] Authentication successful!")

    print("\n[SUCCESS] Gmail SMTP configuration is correct!")
    print("[INFO] The OTP sending should work now.\n")

    server.quit()

except smtplib.SMTPAuthenticationError as e:
    print(f"[ERROR] SMTP Authentication failed: {e}")
    print("[INFO] Verify that:")
    print("  1. SMTP_EMAIL is a valid Gmail address")
    print("  2. SMTP_PASSWORD is an App Password (not regular Gmail password)")
    print("  3. App Password was generated in Gmail Security settings")
    print("[INFO] To create an App Password:")
    print("  1. Go to myaccount.google.com/apppasswords")
    print("  2. Select 'Mail' and 'Windows Computer' (or your device)")
    print("  3. Copy the generated 16-character app password")
    print("  4. Paste it in SMTP_PASSWORD in the .env file\n")
    sys.exit(1)

except smtplib.SMTPConnectError as e:
    print(f"[ERROR] Failed to connect to SMTP server: {e}")
    print("[INFO] Verify that:")
    print(f"  1. SMTP_SERVER is correct: {smtp_server}")
    print(f"  2. SMTP_PORT is correct: {smtp_port}")
    print("  3. Your internet connection is working")
    print("  4. Gmail SMTP is not blocked by firewall\n")
    sys.exit(1)

except smtplib.SMTPNotSupportedError as e:
    print(f"[ERROR] SMTP server does not support TLS: {e}")
    print("[INFO] Verify SMTP server configuration\n")
    sys.exit(1)

except TimeoutError as e:
    print(f"[ERROR] SMTP connection timeout: {e}")
    print("[INFO] Verify:")
    print("  1. Your internet connection is stable")
    print("  2. SMTP_SERVER is accessible")
    print("  3. Firewall is not blocking the connection\n")
    sys.exit(1)

except Exception as e:
    print(f"[ERROR] Unexpected error: {e}")
    print(f"[ERROR] Error type: {type(e).__name__}\n")
    sys.exit(1)
