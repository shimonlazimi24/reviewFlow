# Setting Up Slack Slash Commands

## The Problem
Slack doesn't recognize `/my-reviews` because the command hasn't been registered in your Slack app configuration.

## Solution: Register Slash Commands

### Step 1: Set Up Public URL (for local testing)

Since Slack needs a public URL to send commands to, you have two options:

**Option A: Use ngrok (for local testing)**
```bash
# Install ngrok
brew install ngrok

# Start your ReviewFlow server first
npm run dev

# In another terminal, start ngrok
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

**Option B: Deploy to production** (Heroku, Railway, etc.)

### Step 2: Configure Slash Commands in Slack

1. Go to: https://api.slack.com/apps
2. Select your ReviewFlow app
3. Click **"Slash Commands"** in the left sidebar
4. Click **"Create New Command"**

#### Command 1: `/my-reviews`
- **Command:** `/my-reviews`
- **Request URL:** `https://your-ngrok-url.ngrok.io/slack/events` 
  - Or your production URL: `https://your-domain.com/slack/events`
- **Short Description:** `List your pending code reviews`
- **Usage Hint:** (leave empty)
- Click **"Save"**

#### Command 2: `/create-jira`
- **Command:** `/create-jira`
- **Request URL:** `https://your-ngrok-url.ngrok.io/slack/events`
  - Or your production URL: `https://your-domain.com/slack/events`
- **Short Description:** `Create a Jira ticket`
- **Usage Hint:** `summary`
- Click **"Save"**

### Step 3: Update Your Code to Handle Commands

The Slack Bolt framework should automatically handle slash commands, but we need to make sure the endpoint is correct.

**Important:** Slack sends slash commands to `/slack/events` endpoint, but our current setup uses the ExpressReceiver which handles this automatically.

However, we need to make sure the app is listening on the right path. Let me check if we need to update the code.

### Step 4: Test

1. Make sure your server is running: `npm run dev`
2. Make sure ngrok is running (if testing locally)
3. In Slack, type: `/my-reviews`
4. You should get a response!

## Troubleshooting

**"Command not found"**
- Make sure you saved the command in Slack app settings
- Make sure the Request URL is correct and accessible
- Make sure your server is running

**"Timeout" or "No response"**
- Check that ngrok is running (if local)
- Check server logs for errors
- Verify the Request URL in Slack matches your server URL

**"Invalid signature"**
- Make sure your `SLACK_SIGNING_SECRET` in `.env` matches the one in Slack app settings

## Quick Setup Script

If using ngrok for local testing:

```bash
# Terminal 1: Start server
cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# Copy the ngrok HTTPS URL and use it in Slack app settings
```

