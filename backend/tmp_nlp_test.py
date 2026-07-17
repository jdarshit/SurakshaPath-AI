import requests
import time

base = "http://127.0.0.1:8000"
print('Starting NLP test...')

payload = {
    "area_name": "test-area",
    "text": "Someone was following me near the market at night and it felt unsafe",
    "lat": 22.7196,
    "lng": 75.8577
}

try:
    r = requests.post(f"{base}/incidents/analyze", json=payload, timeout=120)
    print('STATUS', r.status_code)
    print(r.text)
except Exception as e:
    print('ERROR', e)
