import requests

print('health check:')
r = requests.get('http://127.0.0.1:8000/health')
print(r.status_code)
print(r.text)

print('test-config check:')
r = requests.post('http://127.0.0.1:8000/sos/test-config', json={'phone': '919876543210', 'message': 'test'})
print(r.status_code)
print(r.text)
