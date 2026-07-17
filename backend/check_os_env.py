import os

print('='*80)
print('OS ENVIRONMENT VARIABLES (WhatsApp-related)')
print('='*80)

phone_id_os = os.environ.get('WHATSAPP_PHONE_ID')
token_os = os.environ.get('WHATSAPP_ACCESS_TOKEN')

print(f"\nWHATSAPP_PHONE_ID in OS env: {bool(phone_id_os)}")
if phone_id_os:
    print(f"  Value: {phone_id_os}")

print(f"\nWHATSAPP_ACCESS_TOKEN in OS env: {bool(token_os)}")
if token_os:
    # Mask it for display
    masked = f"{token_os[:8]}...{token_os[-8:]}" if len(token_os) > 16 else f"<{len(token_os)} chars>"
    print(f"  Masked: {masked}")
    print(f"  Length: {len(token_os)}")

# Read from .env
print(f"\n" + '='*80)
print("VALUES IN .env FILE")
print('='*80)

from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / '.env'
print(f"\n.env path: {env_path}")
print(f".env exists: {env_path.exists()}")

if env_path.exists():
    env_token = None
    env_phone_id = None
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('WHATSAPP_ACCESS_TOKEN='):
                env_token = line.split('=', 1)[1].strip()
            elif line.startswith('WHATSAPP_PHONE_ID='):
                env_phone_id = line.split('=', 1)[1].strip()
    
    print(f"\nWHATSAPP_PHONE_ID in .env: {env_phone_id}")
    if env_token:
        masked = f"{env_token[:8]}...{env_token[-8:]}" if len(env_token) > 16 else f"<{len(env_token)} chars>"
        print(f"WHATSAPP_ACCESS_TOKEN in .env:")
        print(f"  Masked: {masked}")
        print(f"  Length: {len(env_token)}")
    
    print(f"\n" + '='*80)
    print("COMPARISON")
    print('='*80)
    print(f"Phone ID matches: {phone_id_os == env_phone_id}")
    print(f"Token matches: {token_os == env_token}")
    if token_os != env_token:
        print(f"\n⚠️  MISMATCH: OS env token differs from .env!")
        print(f"   OS Token:   {token_os[:50] if token_os else 'None'}...")
        print(f"   .env Token: {env_token[:50] if env_token else 'None'}...")
