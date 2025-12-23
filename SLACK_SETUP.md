# Slack App Setup Guide for ReviewFlow

## Required Slack App Permissions (Scopes)

Your ReviewFlow bot needs the following scopes to work properly:

### Bot Token Scopes (OAuth & Permissions)
Go to: https://api.slack.com/apps → Your App → OAuth & Permissions

**Required Scopes:**
- `chat:write` - Post messages to channels
- `chat:write.public` - Post to public channels
- `commands` - Use slash commands
- `actions:read` - Read button clicks and interactions
- `users:read` - Read user information
- `channels:read` - Read channel information
- `im:read` - Read direct messages
- `im:write` - Send direct messages

### App-Level Token (if using Socket Mode - optional)
If you want to use Socket Mode instead of webhooks:
- Go to: Basic Information → App-Level Tokens
- Create token with `connections:write` scope

## Step-by-Step Setup

### 1. Create/Configure Your Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" or select existing app
3. Choose "From scratch"
4. Name: `ReviewFlow` (or your preferred name)
5. Select your workspace

### 2. Configure Bot Token Scopes

1. Go to **OAuth & Permissions** in the left sidebar
2. Scroll to **Scopes** → **Bot Token Scopes**
3. Add these scopes:
   - `chat:write`
   - `chat:write.public`
   - `commands`
   - `actions:read`
   - `users:read`
   - `channels:read`
   - `im:read`
   - `im:write`

### 3. Install App to Workspace

1. Scroll to top of OAuth & Permissions page
2. Click **"Install to Workspace"** button
3. Review permissions and click **"Allow"**
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)
   - This is your `SLACK_BOT_TOKEN`

### 4. Enable Home Tab ⭐ **REQUIRED FOR ONBOARDING**

1. Go to **App Home** in the left sidebar (NOT OAuth & Permissions)
2. Under **"Show Tabs"**, toggle **"Home Tab"** to **ON** ✅
3. This enables the Home Tab feature (no scope needed)

### 5. Configure Event Subscriptions ⭐ **REQUIRED FOR HOME TAB**

1. Go to **Event Subscriptions** in the left sidebar
2. Toggle **"Enable Events"** to **ON**
3. **Request URL**: `https://your-app-url.com/slack/events`
   - Replace with your actual app URL (e.g., `https://your-app.railway.app/slack/events`)
   - Slack will verify the URL (make sure your app is running)
4. Under **"Subscribe to bot events"**, click **"Add Bot User Event"**
5. Add this event: **`app_home_opened`** ⭐ **REQUIRED**
6. Click **"Save Changes"**

### 6. Get Signing Secret

1. Go to **Basic Information** in left sidebar
2. Scroll to **App Credentials**
3. Find **Signing Secret**
4. Click **"Show"** and copy the value
   - This is your `SLACK_SIGNING_SECRET`

### 7. Configure Slash Commands

1. Go to **Slash Commands** in left sidebar
2. Click **"Create New Command"**

   **Command 1: `/my-reviews`**
   - Command: `/my-reviews`
   - Request URL: `https://your-domain.com/slack/events` (or your webhook URL)
   - Short description: `List your pending code reviews`
   - Usage hint: (leave empty)
   - Click **Save**

   **Command 2: `/create-jira`**
   - Command: `/create-jira`
   - Request URL: `https://your-domain.com/slack/events` (or your webhook URL)
   - Short description: `Create a Jira ticket`
   - Usage hint: `summary`
   - Click **Save**

### 6. Enable Event Subscriptions (for local testing with ngrok)

1. Go to **Event Subscriptions** in left sidebar
2. Enable **Events**
3. Request URL: Your ngrok URL + `/slack/events` (e.g., `https://abc123.ngrok.io/slack/events`)
4. Subscribe to bot events:
   - `app_mention`
   - `message.channels` (optional)

### 7. Get Channel ID

1. In Slack, right-click on your channel name
2. Click **"View channel details"**
3. Scroll down to find **Channel ID** (starts with `C`)
   - Or from URL: `https://workspace.slack.com/archives/C0123456789`
   - The `C0123456789` part is your Channel ID

## App Agent / Act as App

If you see a prompt about "Allow reviewFlow to act as an App Agent":
- This is typically for advanced features
- For ReviewFlow, you don't need to enable this
- The bot token scopes listed above are sufficient

## Final Checklist

- [ ] Bot token scopes configured
- [ ] App installed to workspace
- [ ] Bot token copied (`xoxb-...`)
- [ ] Signing secret copied
- [ ] Slash commands created
- [ ] Channel ID obtained
- [ ] `.env` file updated with all values

## Testing

After setup, test in Slack:
```
/my-reviews
```

You should get a response from the bot!

