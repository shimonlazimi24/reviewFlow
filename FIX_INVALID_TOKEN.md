# Fix: Invalid Slack Bot Token

## Problem
Your app is receiving `app_home_opened` events, but they're failing because your `SLACK_BOT_TOKEN` is invalid or expired.

**Error in logs:**
```
❌ Invalid Slack bot token!
Authorization of incoming event did not succeed
An incoming event was not acknowledged within 3 seconds
```

## Solution: Get a Valid Bot Token

### Step 1: Get Your Bot Token from Slack

1. Go to: https://api.slack.com/apps
2. Select your **ReviewFlow** app
3. Click **"OAuth & Permissions"** in the left sidebar
4. Scroll to **"OAuth Tokens for Your Workspace"**
5. Find **"Bot User OAuth Token"** (starts with `xoxb-`)
6. Click **"Reinstall to Workspace"** if the token is missing or expired
7. After reinstalling, copy the new **Bot User OAuth Token**

### Step 2: Update Your Environment Variable

**If using Railway:**
1. Go to your Railway project dashboard
2. Click on your service
3. Go to **"Variables"** tab
4. Find `SLACK_BOT_TOKEN`
5. Update it with the new token (starts with `xoxb-`)
6. Save - Railway will automatically redeploy

**If using Render:**
1. Go to your Render dashboard
2. Select your service
3. Go to **"Environment"** tab
4. Find `SLACK_BOT_TOKEN`
5. Update it with the new token
6. Save - Render will automatically redeploy

**If using local development:**
1. Update your `.env` file:
   ```bash
   SLACK_BOT_TOKEN=xoxb-your-new-token-here
   ```
2. Restart your app: `npm run dev`

### Step 3: Verify It Works

1. Wait for your app to redeploy (check logs)
2. Open ReviewFlow in Slack
3. Click the **"Home"** tab
4. You should now see the onboarding setup instead of "work in progress"

## Why This Happens

- Token was revoked or expired
- App was reinstalled but token wasn't updated
- Token was copied incorrectly (missing characters)
- App permissions changed and token needs to be regenerated

## Prevention

- Always copy the full token (it's long, make sure you get it all)
- If you reinstall the app, always update the token
- Store tokens securely (use environment variables, never commit to git)

