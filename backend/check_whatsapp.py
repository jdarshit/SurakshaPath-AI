import requests
import sys

# Usage: python check_whatsapp.py [phone_number] [message]
# Example: python check_whatsapp.py 919876543210 "Test message"
# Default test phone (must be added to recipient list in Meta Business Manager)
phone = sys.argv[1] if len(sys.argv) > 1 else "919999999999"
message = sys.argv[2] if len(sys.argv) > 2 else "Test WhatsApp from SurakshaPath AI"

payload = {"phone": phone, "message": message}

print(f"\n{'='*80}")
print(f"Testing WhatsApp delivery to: {phone}")
print(f"Message: {message}")
print(f"{'='*80}\n")

try:
    r = requests.post('http://127.0.0.1:8000/sos/test-config', json=payload, timeout=30)
    print('STATUS', r.status_code)
    if r.status_code == 200:
        print("✅ SUCCESS: Message sent!")
    else:
        print("❌ FAILED")
    print("\nResponse:")
    print(r.text)
except Exception as e:
    print('ERROR', e)
