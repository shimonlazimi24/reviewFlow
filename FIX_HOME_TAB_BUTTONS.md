# Fix: Home Tab Buttons Not Clickable

## Problem
The "Start Setup" button in the Home tab is not clickable or doesn't open the modal.

## Solution: Enable Interactivity

Home tab buttons require **Interactivity** to be enabled in your Slack app settings.

### Step 1: Enable Interactivity

1. Go to: https://api.slack.com/apps
2. Select your **ReviewFlow** app
3. Click **"Interactivity & Shortcuts"** in the left sidebar
4. Toggle **"Interactivity"** to **ON** ✅
5. **Request URL**: `https://your-app-url.com/slack/events`
   - Replace with your actual app URL (e.g., `https://your-app.railway.app/slack/events`)
   - Or your ngrok URL: `https://xxxx.ngrok-free.app/slack/events`
6. Click **"Save Changes"**

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

## Debugging

If the button still doesn't work after enabling Interactivity:

1. **Check your app logs** when you click the button
2. You should see: `Start setup button clicked` in the logs
3. If you see errors, check:
   - Is the Request URL correct?
   - Is your app running and accessible?
   - Are there any errors in the logs?

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

