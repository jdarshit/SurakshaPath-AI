"""
Simple test for the send_otp_email function
"""
import sys
import os

# Add the project root to the path
sys.path.insert(0, os.path.dirname(__file__))

from backend.auth import send_otp_email

print("[TEST] Testing send_otp_email function...")
print("[TEST] Calling send_otp_email('test@example.com', '123456')")

try:
    result = send_otp_email('test@example.com', '123456')
    print(f"[TEST] Result type: {type(result)}")
    print(f"[TEST] Result value: {result}")
    
    if isinstance(result, tuple):
        success, message = result
        print(f"[TEST] Success: {success}")
        print(f"[TEST] Message: {message}")
    else:
        print(f"[ERROR] Expected tuple, got {type(result)}")
except Exception as e:
    print(f"[ERROR] Exception: {e}")
    import traceback
    traceback.print_exc()
