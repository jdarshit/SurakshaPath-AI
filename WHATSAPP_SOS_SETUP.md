# SOS WhatsApp Direct Messaging Setup Guide

## ✅ Fixed Issue
The SOS button now sends WhatsApp messages **directly** to guardian without opening WhatsApp manually.

### What Changed
1. **Removed Manual WhatsApp Opening**: No more `window.open()` for WhatsApp Web
2. **Automatic Message Sending**: Backend sends message directly via WhatsApp Business API
3. **Current GPS Location**: SOS now sends actual user location, not destination
4. **One-Click Process**: Hold SOS button → Message sent automatically

---

## Setup Instructions

### Option 1: Meta WhatsApp Business Cloud API (RECOMMENDED)

#### Step 1: Create Meta Business Account
1. Go to [Meta Business Manager](https://business.facebook.com)
2. Create a new Business Account if you don't have one
3. Go to "Apps & Businesses" → "Apps"
4. Create a new app or use existing app
5. Add "WhatsApp" product

#### Step 2: Set Up WhatsApp Business Account
1. In Meta Business Manager, go to "Tools" → "Manage Phone Numbers"
2. Add or select a phone number for WhatsApp
3. Go to WhatsApp settings and note your **Phone Number ID**

#### Step 3: Get Access Token
1. In Meta Business Manager, go to "System User"
2. Create a new system user or use existing one
3. Generate an access token with these permissions:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
4. Copy the **Access Token** (this is sensitive - don't share!)

#### Step 4: Add Environment Variables
Edit your `.env` file:

```env
# WhatsApp Business Cloud API (Meta)
WHATSAPP_PHONE_ID=YOUR_PHONE_NUMBER_ID
WHATSAPP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
```

Replace:
- `YOUR_PHONE_NUMBER_ID`: The phone number ID from Meta (usually starts with "1" or "2")
- `YOUR_ACCESS_TOKEN`: The access token you generated

#### Step 5: Verify Setup
1. Restart the backend server
2. In SurakshaPath AI, go to Profile → Edit Guardian Details
3. Enter guardian phone number (format: 919876543210 or +919876543210)
4. Click "Update Profile"
5. In any location, hold the SOS button to test
6. Check if guardian receives WhatsApp message (usually within 2-5 seconds)

---

### Option 2: Alternative WhatsApp API Services

If you don't want to use Meta's API, you can use services like:
- **Twilio WhatsApp**: `WHATSAPP_API_URL` and `WHATSAPP_API_KEY`
- **Vonage WhatsApp**: Similar setup with API credentials

Edit `.env`:
```env
# Alternative WhatsApp API
WHATSAPP_API_URL=https://api.your-provider.com/send
WHATSAPP_API_KEY=your_api_key
```

---

### Option 3: Fallback Mode (No WhatsApp API)

If you don't set up WhatsApp API, the system will:
1. **Still save SOS alert** in database ✅
2. **Still send alert** with location to backend ✅
3. **Log message** in server console (for admin to see) ⚠️
4. **Show message** to user: "Setup WhatsApp API for automatic sending" ℹ️

This is a fallback mode - messages won't reach guardian automatically.

---

## How It Works

### User Presses SOS Button
```
1. Hold SOS Button
   ↓
2. System gets CURRENT location (where user is NOW)
   ↓
3. Message created with location link
   ↓
4. Backend receives SOS request
   ↓
5. Backend sends WhatsApp message to guardian
   ↓
6. Guardian receives message in WhatsApp
   ↓
7. User sees "✅ SOS alert sent!"
```

### Example Message Received
```
🚨 EMERGENCY SOS 🚨
Please help immediately!
Location: https://maps.google.com/?q=22.7177,75.8545

[User's guardian gets this message within 2-5 seconds]
```

---

## Troubleshooting

### ❌ Message Not Sending

**Check 1: Guardian Phone Not Set**
- Go to Profile → Edit Guardian Details
- Ensure phone number is entered and saved
- Format should be: 919876543210 (or +919876543210)

**Check 2: WhatsApp API Not Configured**
- Check server console logs (look for "⚠️ No WhatsApp API configured")
- Set `WHATSAPP_PHONE_ID` and `WHATSAPP_ACCESS_TOKEN` in `.env`
- Restart backend server
- Test again

**Check 3: Access Token Expired**
- Meta access tokens can expire
- Regenerate new token in Meta Business Manager
- Update `.env` file
- Restart backend

**Check 4: Phone Number Not Verified**
- In Meta Business Manager, verify the guardian's phone number
- Start conversation from verified number first
- Then try SOS

### ❌ GPS Location Not Available

**Solution:**
- Open browser location permissions for SurakshaPath AI
- Refresh page
- Click "Allow" when browser asks for location
- Wait 5-10 seconds for GPS to lock
- Try SOS again

### ✅ Message Sent But Guardian Didn't Receive

- Check guardian's WhatsApp is connected
- Check spam/filtered messages folder
- Verify phone number format is correct
- Try sending test message manually to confirm WhatsApp works

---

## Security Notes

### 🔒 Protect Your Credentials
- **Never** commit `.env` file to git
- **Never** share access tokens in emails/chat
- **Only** store credentials in `.env` file
- Use strong, unique tokens
- Rotate tokens every 3-6 months

### 📱 Phone Numbers
- Phone numbers are encrypted in database
- Only backend has access to WhatsApp credentials
- Messages sent via secure HTTPS connection

---

## Testing

### Manual Test
```bash
# In terminal at project root
curl -X POST http://localhost:8000/sos/trigger \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 22.7177,
    "lng": 75.8545,
    "source": "app",
    "message": "Test SOS message"
  }'
```

### Expected Backend Log
```
✅ WhatsApp SOS sent to 919876543210
```

---

## Support

If WhatsApp messages still aren't sending:

1. **Check Environment Variables**
   ```bash
   # In backend/.env
   echo $WHATSAPP_PHONE_ID
   echo $WHATSAPP_ACCESS_TOKEN
   ```

2. **Check Logs**
   ```bash
   # Server terminal should show
   [2026-06-03 12:34:56] ✅ WhatsApp SOS sent to 919876543210
   ```

3. **Test Meta API Directly**
   - Use Meta's API test tool in Business Manager
   - Send test message to verify credentials work

4. **Contact Support**
   - Check WhatsApp Business documentation
   - Contact Meta support if API credentials issues
   - Check SurakshaPath AI GitHub for updates

---

## Cost

- **Meta WhatsApp Business API**: Free for first 1,000 messages/month, then ~$0.05 per message
- **Twilio/Vonage**: Varies by provider ($0.01-0.10 per message typical)
- **Setup**: Free

---

## Summary

✅ **SOS now sends WhatsApp messages directly to guardian**  
✅ **Current GPS location is sent (not destination)**  
✅ **One-hold process - fully automated**  
✅ **Message includes location link for guardian to track**  
✅ **No manual WhatsApp opening needed**  

Get WhatsApp API credentials from Meta Business Manager and set environment variables to enable this feature!
