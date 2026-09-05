"""
Test OTP sending via API endpoint
"""
import requests
import json

API_URL = "http://127.0.0.1:8000"

# Test email address
test_email = "suraksha.test@gmail.com"

print("[TEST] Testing OTP API endpoint...")
print(f"[TEST] API URL: {API_URL}")
print(f"[TEST] Testing email: {test_email}\n")

try:
    # Send OTP request
    print("[TEST] Sending POST request to /auth/send-otp...")
    response = requests.post(
        f"{API_URL}/auth/send-otp",
        json={"email": test_email},
        timeout=30
    )
    
    print(f"[TEST] Status Code: {response.status_code}")
    print(f"[TEST] Response:")
    print(json.dumps(response.json(), indent=2))
    
    if response.status_code == 200:
        print("\n✅ OTP request SUCCESSFUL!")
        print("[TEST] Check your email for the OTP code")
    else:
        print(f"\n❌ OTP request FAILED with status {response.status_code}")
        
except requests.exceptions.ConnectionError:
    print("❌ Cannot connect to backend. Is it running on http://127.0.0.1:8000?")
except requests.exceptions.Timeout:
    print("❌ Request timeout - backend is slow or not responding")
except Exception as e:
    print(f"❌ Error: {e}")
