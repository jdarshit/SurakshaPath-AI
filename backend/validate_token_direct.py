import os
from pathlib import Path
from dotenv import load_dotenv
import requests

# Load .env explicitly
env_path = Path(__file__).resolve().parent / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=str(env_path))

token = os.getenv('WHATSAPP_ACCESS_TOKEN')
phone_id = os.getenv('WHATSAPP_PHONE_ID')

print('='*80)
print('DIRECT META GRAPH API TOKEN VALIDATION')
print('='*80)

print(f"\nToken loaded (masked): {token[:8]}...{token[-8:] if len(token) > 16 else ''}")
print(f"Phone ID: {phone_id}")
print(f"Token length: {len(token)}")

# Test 1: Validate token via /me endpoint
print(f"\n" + '='*80)
print("TEST 1: GET https://graph.facebook.com/v18.0/me (validate token)")
print('='*80)

try:
    r = requests.get(
        'https://graph.facebook.com/v18.0/me',
        params={'access_token': token},
        timeout=15
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Test 2: Try to get phone number info
print(f"\n" + '='*80)
print(f"TEST 2: GET https://graph.facebook.com/v18.0/{phone_id} (validate phone)")
print('='*80)

try:
    r = requests.get(
        f'https://graph.facebook.com/v18.0/{phone_id}',
        params={'access_token': token},
        timeout=15
    )
    print(f"Status: {r.status_code}")
    print(f"Response: {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Test 3: Check token fields
print(f"\n" + '='*80)
print("TEST 3: GET https://graph.facebook.com/debug_token (token introspection)")
print('='*80)

try:
    r = requests.get(
        'https://graph.facebook.com/debug_token',
        params={
            'input_token': token,
            'access_token': token  # Using token to introspect itself
        },
        timeout=15
    )
    print(f"Status: {r.status_code}")
    import json
    print(json.dumps(r.json(), indent=2)[:500])
except Exception as e:
    print(f"Error: {e}")
