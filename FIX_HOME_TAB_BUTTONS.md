# Fix: Home Tab Buttons Not Clickable

## Problem
The "Start Setup" button in the Home tab is not clickable or doesn't open the modal.

**Symptoms:**
- Button appears but nothing happens when clicked
- No log entries when clicking the button (no "Start setup button clicked" in logs)
- Button click events are not reaching your app

## Root Cause
**Interactivity is NOT enabled** in your Slack app settings. Without Interactivity, button clicks from Home tabs cannot reach your app.

## Solution: Enable Interactivity ⭐ **REQUIRED**

Home tab buttons **REQUIRE** Interactivity to be enabled. This is a separate setting from Event Subscriptions.

### Step 1: Enable Interactivity ⭐ **CRITICAL**

1. Go to: https://api.slack.com/apps
2. Select your **ReviewFlow** app
3. Click **"Interactivity & Shortcuts"** in the left sidebar (NOT "Event Subscriptions")
4. Toggle **"Interactivity"** to **ON** ✅
5. **Request URL**: `https://your-app-url.com/slack/events`
   - Replace with your actual app URL (e.g., `https://your-app.railway.app/slack/events`)
   - Or your ngrok URL: `https://xxxx.ngrok-free.app/slack/events`
   - **IMPORTANT:** This must be the SAME URL as your Event Subscriptions Request URL
6. Click **"Save Changes"**
7. **Verify:** Slack will test the URL - make sure it shows ✅ "Verified"

### Step 2: Verify Event Subscriptions

Make sure you have:
- **Event Subscriptions** enabled
- **Request URL** set to: `https://your-app-url.com/slack/events`
- **Bot Events** subscribed: `app_home_opened`

### Step 3: Reinstall App (if needed)

If you just enabled Interactivity:
1. Go to **OAuth & Permissions**
2. Click **"Reinstall to Workspace"**
3. Approve the new permissions

### Step 4: Test

1. Wait for your app to redeploy (1-2 minutes)
2. Open ReviewFlow in Slack → **Home** tab
3. Click **"🚀 Start Setup"** button
4. The setup modal should open!

## How to Verify It's Working

After enabling Interactivity:

1. **Wait 1-2 minutes** for changes to propagate
2. **Click the "Start Setup" button** in the Home tab
3. **Check your app logs** - you should see:
   ```
   [INFO] Start setup button clicked { hasTeam: true, hasTriggerId: true, ... }
   ```
4. **The setup modal should open!**

## Debugging

### If you see NO log entry when clicking:
- ❌ **Interactivity is NOT enabled** - Go back to Step 1
- ❌ **Request URL is wrong** - Check the URL matches your app
- ❌ **App is not accessible** - Check if your app is running and the URL is reachable

### If you see "Start setup button clicked" but modal doesn't open:
- Check for errors in logs after that line
- Look for "Missing trigger ID" - this means Interactivity is enabled but trigger_id is missing
- Look for "Error opening setup modal" - check the error message

### If you see "Missing trigger ID":
- This is rare but can happen - try clicking the button again
- The handler will try to send an ephemeral message instead

## Common Issues

### "Missing trigger ID"
- This means the button click was received but `trigger_id` is missing
- Usually means Interactivity is not enabled or Request URL is wrong

### "Missing team ID"
- The handler will try to get it from `auth.test()`
- Should work automatically in single-workspace mode

### Button not clickable at all
- Make sure Interactivity is enabled
- Make sure Request URL is correct
- Make sure your app is running and accessible

