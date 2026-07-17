import os
import requests
from pathlib import Path
from dotenv import load_dotenv

# Load backend/.env explicitly
env_path = Path(__file__).resolve().parent / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=str(env_path))

token = os.getenv('WHATSAPP_ACCESS_TOKEN')
phone_id = os.getenv('WHATSAPP_PHONE_ID')
print('Phone ID present:', bool(phone_id))
print('Token present:', bool(token))

if not token:
    print('No token available in environment')
else:
    try:
        r = requests.get(f'https://graph.facebook.com/v18.0/me', params={'access_token': token}, timeout=15)
        print('STATUS', r.status_code)
        print(r.text)
    except Exception as e:
        print('ERROR', e)
