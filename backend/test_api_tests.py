import time
import requests

base = "http://127.0.0.1:8000"
print('Waiting briefly for server...')
time.sleep(2)

# NLP/text analysis test
try:
    r = requests.post(f"{base}/incidents/analyze", json={
        "area_name": "test-area",
        "text": "Someone was following me near the market at night and it felt unsafe",
        "lat": 22.7196,
        "lng": 75.8577
    }, timeout=30)
    print('\nINCIDENT ANALYZE RESPONSE:')
    print(r.status_code)
    print(r.text)
except Exception as e:
    print('\nINCIDENT ANALYZE ERROR:', e)

# CNN/image analysis test
img_path = 'backend/ml_data/images/unsafe/unsafe_0.jpg'
try:
    with open(img_path, 'rb') as f:
        files = {'file': ('unsafe_0.jpg', f, 'image/jpeg')}
        data = {'area_name': 'test-area-image'}
        r2 = requests.post(f"{base}/areas/analyze-image", files=files, data=data, timeout=60)
        print('\nIMAGE ANALYZE RESPONSE:')
        print(r2.status_code)
        print(r2.text)
except Exception as e:
    print('\nIMAGE ANALYZE ERROR:', e)
