"""
WebSocket SOS Alert System - Testing Script
============================================

Test the real-time SOS alert functionality.

Usage:
    python test_sos_system.py

Requirements:
    pip install websockets aiohttp

Make sure FastAPI server is running:
    uvicorn backend.main:app --reload
"""

import asyncio
import json
import sys
import time
from datetime import datetime

try:
    import websockets
    import aiohttp
except ImportError:
    print("❌ Required packages not found!")
    print("Install with: pip install websockets aiohttp")
    sys.exit(1)


class SOSTestClient:
    """Test client for SOS alert system."""
    
    def __init__(self, ws_url="ws://localhost:8000/ws/sos", api_url="http://localhost:8000"):
        self.ws_url = ws_url
        self.api_url = api_url
        self.alerts_received = []

    async def trigger_alert(self, user_id=4, lat=22.7196, lng=75.8577, source="app"):
        """Trigger a SOS alert via HTTP."""
        payload = {
            "user_id": user_id,
            "lat": lat,
            "lng": lng,
            "source": source
        }
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.api_url}/sos/trigger",
                    json=payload,
                    headers={"Content-Type": "application/json"}
                ) as response:
                    if response.status == 201:
                        data = await response.json()
                        print(f"✅ SOS Alert Triggered!")
                        print(f"   Alert ID: {data['alert']['id']}")
                        print(f"   Location: {data['alert']['lat']}, {data['alert']['lng']}")
                        return True
                    else:
                        print(f"❌ Failed to trigger alert. Status: {response.status}")
                        print(await response.text())
                        return False
        except Exception as e:
            print(f"❌ Error triggering alert: {e}")
            return False

    async def get_active_alerts(self):
        """Get all active SOS alerts."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(f"{self.api_url}/sos/active") as response:
                    if response.status == 200:
                        data = await response.json()
                        print(f"✅ Active Alerts: {data['count']}")
                        for alert in data['alerts']:
                            print(f"   - ID: {alert['id']}, Lat: {alert['lat']}, Lng: {alert['lng']}")
                        return data['alerts']
                    else:
                        print(f"❌ Failed to get alerts. Status: {response.status}")
                        return []
        except Exception as e:
            print(f"❌ Error getting alerts: {e}")
            return []

    async def listen_for_alerts(self, duration=30):
        """Listen for SOS alerts via WebSocket for specified duration."""
        print(f"\n🔌 Connecting to WebSocket: {self.ws_url}")
        
        try:
            async with websockets.connect(self.ws_url) as websocket:
                print("✅ WebSocket connected!")
                
                start_time = time.time()
                while time.time() - start_time < duration:
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        alert = json.loads(message)
                        
                        if alert.get("type") == "SOS_ALERT":
                            print(f"\n🚨 NEW SOS ALERT RECEIVED!")
                            print(f"   ID: {alert['data']['id']}")
                            print(f"   User: {alert['data']['user_id']}")
                            print(f"   Location: {alert['data']['lat']}, {alert['data']['lng']}")
                            print(f"   Source: {alert['data']['source']}")
                            print(f"   Status: {alert['data']['status']}")
                            print(f"   Triggered: {alert['data']['triggered_at']}")
                            self.alerts_received.append(alert['data'])
                    except asyncio.TimeoutError:
                        pass  # Timeout waiting for message, continue
                    except Exception as e:
                        print(f"⚠️ Error receiving message: {e}")

                print(f"\n❌ Listener timeout after {duration} seconds")
                
        except ConnectionRefusedError:
            print(f"❌ Could not connect to {self.ws_url}")
            print("   Make sure FastAPI server is running:")
            print("   uvicorn backend.main:app --reload")
        except Exception as e:
            print(f"❌ WebSocket error: {e}")


async def test_scenario_1():
    """Test: Single alert broadcast."""
    print("\n" + "="*60)
    print("TEST 1: Single Alert Broadcast")
    print("="*60)
    
    client = SOSTestClient()
    
    # Start listener
    listener_task = asyncio.create_task(client.listen_for_alerts(duration=10))
    
    # Wait 2 seconds then trigger alert
    await asyncio.sleep(2)
    await client.trigger_alert(user_id=4, lat=22.7196, lng=75.8577, source="app")
    
    # Wait for listener
    await listener_task
    
    if client.alerts_received:
        print(f"\n✅ TEST PASSED: Received {len(client.alerts_received)} alert(s)")
    else:
        print("\n❌ TEST FAILED: No alerts received")


async def test_scenario_2():
    """Test: Multiple alerts."""
    print("\n" + "="*60)
    print("TEST 2: Multiple Alerts")
    print("="*60)
    
    client = SOSTestClient()
    
    # Start listener
    listener_task = asyncio.create_task(client.listen_for_alerts(duration=15))
    
    # Trigger multiple alerts
    await asyncio.sleep(2)
    print("\n🚨 Triggering Alert 1...")
    await client.trigger_alert(user_id=4, lat=22.7196, lng=75.8577, source="app")
    
    await asyncio.sleep(3)
    print("\n🚨 Triggering Alert 2...")
    await client.trigger_alert(user_id=5, lat=22.7200, lng=75.8580, source="iot")
    
    await asyncio.sleep(3)
    print("\n🚨 Triggering Alert 3...")
    await client.trigger_alert(user_id=6, lat=22.7210, lng=75.8590, source="app")
    
    # Wait for listener
    await listener_task
    
    if len(client.alerts_received) >= 3:
        print(f"\n✅ TEST PASSED: Received all {len(client.alerts_received)} alerts")
    else:
        print(f"\n⚠️ TEST PARTIAL: Received {len(client.alerts_received)}/3 alerts")


async def test_scenario_3():
    """Test: Get active alerts API."""
    print("\n" + "="*60)
    print("TEST 3: Get Active Alerts API")
    print("="*60)
    
    client = SOSTestClient()
    
    # Trigger an alert
    print("\n🚨 Triggering alert...")
    await client.trigger_alert(user_id=7, lat=22.7220, lng=75.8600, source="iot")
    
    # Give it a moment to be saved
    await asyncio.sleep(1)
    
    # Get active alerts
    print("\n📋 Fetching active alerts...")
    alerts = await client.get_active_alerts()
    
    if alerts and len(alerts) > 0:
        print(f"\n✅ TEST PASSED: Found {len(alerts)} active alert(s)")
    else:
        print("\n❌ TEST FAILED: No active alerts found")


async def test_scenario_4():
    """Test: Concurrent connections."""
    print("\n" + "="*60)
    print("TEST 4: Concurrent Connections")
    print("="*60)
    
    clients = [SOSTestClient() for _ in range(3)]
    
    # Start 3 listeners
    listeners = [
        asyncio.create_task(client.listen_for_alerts(duration=10))
        for client in clients
    ]
    
    # Wait 2 seconds then trigger alert
    await asyncio.sleep(2)
    print("\n🚨 Triggering alert (should reach all 3 listeners)...")
    await clients[0].trigger_alert(user_id=8, lat=22.7230, lng=75.8610, source="app")
    
    # Wait for all listeners
    await asyncio.gather(*listeners)
    
    # Check if all received the alert
    total_received = sum(len(c.alerts_received) for c in clients)
    if total_received >= 3:
        print(f"\n✅ TEST PASSED: All 3 clients received the alert!")
    else:
        print(f"\n⚠️ TEST PARTIAL: Only {total_received}/3 clients received alert")


async def main():
    """Run all tests."""
    print("\n")
    print("╔════════════════════════════════════════════════════╗")
    print("║   SOS Alert WebSocket System - Test Suite         ║")
    print("║   SurakshaPath AI                                  ║")
    print("╚════════════════════════════════════════════════════╝")
    
    print("\n⚠️  Make sure FastAPI server is running:")
    print("   uvicorn backend.main:app --reload")
    print("\n   Server should be at: http://localhost:8000")
    
    # Run tests
    try:
        await test_scenario_1()
        await asyncio.sleep(1)
        
        await test_scenario_2()
        await asyncio.sleep(1)
        
        await test_scenario_3()
        await asyncio.sleep(1)
        
        await test_scenario_4()
        
    except KeyboardInterrupt:
        print("\n\n❌ Tests interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print("\n" + "="*60)
    print("✅ ALL TESTS COMPLETED")
    print("="*60)
    print("\n📚 For more info, see: WEBSOCKET_SOS_GUIDE.md")
    print("\n")


if __name__ == "__main__":
    asyncio.run(main())
