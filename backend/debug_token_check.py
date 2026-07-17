import requests
import json

try:
    r = requests.get('http://127.0.0.1:8000/sos/debug-token-info', timeout=15)
    print('STATUS', r.status_code)
    print('\n' + '='*80)
    print('DEBUG TOKEN INFO (Runtime vs .env)')
    print('='*80 + '\n')
    data = r.json()
    print(json.dumps(data, indent=2))
    
    print('\n' + '='*80)
    print('SUMMARY')
    print('='*80)
    print(f"Tokens match: {data.get('tokens_match')}")
    print(f"Runtime token: {data.get('runtime_token_masked')}")
    print(f"File token: {data.get('env_file_token_masked')}")
    print(f"OS env override: {data.get('os_env_override_check')}")
    
except Exception as e:
    print('ERROR', e)
