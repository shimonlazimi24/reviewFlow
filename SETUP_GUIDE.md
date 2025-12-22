# ReviewFlow - Complete Setup Guide

This guide walks you through all the manual configuration steps needed in Slack, GitHub, and Jira.

## 📋 Prerequisites

- ReviewFlow deployed and running (Railway/Render)
- Your app URL (e.g., `https://your-app.railway.app`)
- Admin access to your Slack workspace
- Admin access to your GitHub repositories
- Jira admin access (if using Jira integration)

---

## 1. 🔵 Slack Configuration

### Step 1.1: Create/Configure Slack App

1. Go to [Slack API Dashboard](https://api.slack.com/apps)
2. Click **"Create New App"** → **"From scratch"**
3. Name: `ReviewFlow` (or your choice)
4. Select your workspace
5. Click **"Create App"**

### Step 1.2: Configure Bot Token Scopes

1. Go to **"OAuth & Permissions"** in the left sidebar
2. Scroll to **"Scopes"** → **"Bot Token Scopes"**
3. Add these scopes:
   ```
   app_mentions:read
   channels:history
   channels:read
   chat:write
   chat:write.public
   commands
   im:history
   im:read
   im:write
   users:read
   users:read.email
   ```
4. Scroll up and click **"Install to Workspace"**
5. Copy the **"Bot User OAuth Token"** (starts with `xoxb-`)
   - This is your `SLACK_BOT_TOKEN`

### Step 1.3: Get Signing Secret

1. Go to **"Basic Information"** in the left sidebar
2. Scroll to **"App Credentials"**
3. Copy the **"Signing Secret"**
   - This is your `SLACK_SIGNING_SECRET`

### Step 1.4: Get Channel ID

1. Open Slack desktop/web app
2. Right-click on your channel → **"View channel details"**
3. Scroll down to find **"Channel ID"** (starts with `C`)
   - This is your `SLACK_DEFAULT_CHANNEL_ID`
   - Or use the channel picker in Slack and copy from URL

### Step 1.5: Register Slash Commands

1. Go to **"Slash Commands"** in the left sidebar
2. Click **"Create New Command"** for each command:

#### Command 1: `/cr`
- **Command**: `/cr`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Code review commands`
- **Usage Hint**: `my | team | settings`
- Click **"Save"**

#### Command 2: `/my-reviews`
- **Command**: `/my-reviews`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `List your pending reviews`
- Click **"Save"**

#### Command 3: `/list-reviewers`
- **Command**: `/list-reviewers`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `List all team reviewers`
- Click **"Save"**

#### Command 4: `/add-reviewer` (Admin)
- **Command**: `/add-reviewer`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Add a team reviewer (admin only)`
- **Usage Hint**: `<slack-user-id> <github-username> <role>`
- Click **"Save"**

#### Command 5: `/remove-reviewer` (Admin)
- **Command**: `/remove-reviewer`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Remove a team reviewer (admin only)`
- Click **"Save"**

#### Command 6: `/set-weight` (Admin)
- **Command**: `/set-weight`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Set reviewer weight (admin only)`
- Click **"Save"**

#### Command 7: `/set-unavailable`
- **Command**: `/set-unavailable`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Mark yourself as unavailable (vacation/sick)`
- Click **"Save"**

#### Command 8: `/set-available`
- **Command**: `/set-available`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Mark yourself as available`
- Click **"Save"`

#### Command 9: `/reassign-pr`
- **Command**: `/reassign-pr`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Reassign PR to another reviewer`
- Click **"Save"`

#### Command 10: `/create-jira`
- **Command**: `/create-jira`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Create a Jira ticket`
- Click **"Save"**

#### Command 11: `/create-team` (Admin)
- **Command**: `/create-team`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Create a new team (admin only)`
- Click **"Save"**

#### Command 12: `/list-teams`
- **Command**: `/list-teams`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `List all teams`
- Click **"Save"**

#### Command 13: `/map-repo` (Admin)
- **Command**: `/map-repo`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Map repository to team (admin only)`
- Click **"Save"**

#### Command 14: `/list-repos`
- **Command**: `/list-repos`
- **Request URL**: `https://your-app.railway.app/slack.app/slack/events`
- **Short Description**: `List repository mappings`
- Click **"Save"**

#### Command 15: `/assign-to-team` (Admin)
- **Command**: `/assign-to-team`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `Assign member to team (admin only)`
- Click **"Save"`

#### Command 16: `/metrics`
- **Command**: `/metrics`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `View review metrics`
- Click **"Save"**

#### Command 17: `/team-metrics`
- **Command**: `/team-metrics`
- **Request URL**: `https://your-app.railway.app/slack/events`
- **Short Description**: `View team-specific metrics`
- Click **"Save"**

### Step 1.6: Configure Event Subscriptions

1. Go to **"Event Subscriptions"** in the left sidebar
2. Toggle **"Enable Events"** to **ON**
3. **Request URL**: `https://your-app.railway.app/slack/events`
   - Slack will verify the URL (make sure your app is running)
4. Under **"Subscribe to bot events"**, add:
   ```
   app_mention
   message.channels
   message.im
   ```
5. Click **"Save Changes"**

### Step 1.7: Add Bot to Channel

1. In Slack, go to your channel
2. Type `/invite @ReviewFlow` (or your bot name)
3. Or: Channel settings → **"Integrations"** → Add app

### Step 1.8: Set Admin Users (Optional)

1. Get your Slack User ID:
   - Right-click your profile → **"View profile"**
   - Click the three dots → **"Copy member ID"**
2. Add to environment variables:
   ```
   ADMIN_SLACK_USER_IDS=U01234567,U09876543
   ```
   - Or set `ALLOW_ALL_WORKSPACE_ADMINS=true` to allow all workspace admins

---

## 2. 🐙 GitHub Configuration

### Step 2.1: Create Webhook Secret

1. Generate a random secret (for security):
   ```bash
   openssl rand -hex 32
   ```
   - Or use any random string
   - Save this as `GITHUB_WEBHOOK_SECRET` in your environment variables

### Step 2.2: Add Webhook to Repository

1. Go to your GitHub repository
2. Click **"Settings"** → **"Webhooks"** → **"Add webhook"**
3. **Payload URL**: `https://your-app.railway.app/webhooks/github`
4. **Content type**: `application/json`
5. **Secret**: Paste your `GITHUB_WEBHOOK_SECRET`
6. **Which events**: Select **"Let me select individual events"**
7. Check only: **"Pull requests"**
8. **Active**: ✅ Checked
9. Click **"Add webhook"**

### Step 2.2: Test Webhook

1. After creating webhook, GitHub will send a test ping
2. Check your app logs to see if it received the webhook
3. You should see a log entry about the webhook

### Step 2.3: Configure PR Labels (Optional but Recommended)

Add labels to your repository for automatic stack detection:
- `frontend` or `fe` → Frontend PRs
- `backend` or `be` → Backend PRs
- If both → Mixed stack

**How to add labels:**
1. Go to repository → **"Issues"** → **"Labels"**
2. Click **"New label"**
3. Create labels: `frontend`, `backend`, `fe`, `be`

---

## 3. 🎫 Jira Configuration (Optional)

### Step 3.1: Create API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **"Create API token"**
3. Give it a label: `ReviewFlow`
4. Copy the token (you'll only see it once!)
   - This is your `JIRA_API_TOKEN`

### Step 3.2: Get Jira Base URL

1. Your Jira URL format: `https://your-company.atlassian.net`
   - This is your `JIRA_BASE_URL`

### Step 3.3: Get Project Key

1. Go to your Jira project
2. The project key is in the URL or project settings
   - Example: `PROJ`, `DEV`, `ENG`
   - This is your `JIRA_PROJECT_KEY`

### Step 3.4: Get Sprint Field ID (Optional)

1. Go to a sprint in Jira
2. Inspect the page source or use Jira API
3. Common field ID: `customfield_10020`
   - This is your `JIRA_DEFAULT_SPRINT_FIELD`
   - Default is already set, only change if needed

### Step 3.5: Configure Environment Variables

Add to your environment variables:
```
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=bot@your-company.com
JIRA_API_TOKEN=your-api-token-here
JIRA_PROJECT_KEY=PROJ
JIRA_ISSUE_TYPE=Task
JIRA_AUTO_CREATE_ON_PR_OPEN=false  # Set to true for auto-creation
JIRA_AUTO_TRANSITION_ON_OPEN=false
JIRA_AUTO_TRANSITION_ON_MERGE=false
JIRA_OPEN_TRANSITION_NAME=In Review
JIRA_MERGE_TRANSITION_NAME=Done
```

---

## 4. 🔧 Environment Variables Summary

Add all these to Railway/Render environment variables:

### Required
```bash
PORT=3000
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_DEFAULT_CHANNEL_ID=C0123456789
```

### Optional (GitHub)
```bash
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

### Optional (Jira)
```bash
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=bot@your-company.com
JIRA_API_TOKEN=your-api-token
JIRA_PROJECT_KEY=PROJ
JIRA_ISSUE_TYPE=Task
JIRA_AUTO_CREATE_ON_PR_OPEN=false
```

### Optional (Database)
```bash
DATABASE_URL=postgresql://...
```

### Optional (Admin)
```bash
ADMIN_SLACK_USER_IDS=U01234567,U09876543
ALLOW_ALL_WORKSPACE_ADMINS=false
```

### Optional (Billing)
```bash
SUBSCRIPTION_TIER=free  # free, premium, enterprise
```

### Optional (Reminders)
```bash
REMINDER_ENABLED=true
REMINDER_FIRST_HOURS=24
REMINDER_ESCALATION_HOURS=48
REMINDER_CHECK_INTERVAL_MINUTES=60
```

---

## 5. ✅ Testing Checklist

### Test Slack Integration

1. **Test slash command:**
   ```
   /list-reviewers
   ```
   Should show: "No reviewers configured yet"

2. **Add a reviewer (as admin):**
   ```
   /add-reviewer U01234567 alice FE
   ```
   Should show: "✅ Added reviewer"

3. **List reviewers:**
   ```
   /list-reviewers
   ```
   Should show your added reviewer

4. **Test personal reviews:**
   ```
   /cr my
   ```
   Should show: "✅ You have no pending reviews!"

### Test GitHub Integration

1. **Create a test PR:**
   - Open a PR in your repository
   - Add labels: `frontend` or `backend`
   - PR should appear in Slack channel

2. **Check assignment:**
   - PR should be assigned to a reviewer
   - Reviewer should receive a DM

3. **Test PR actions:**
   - Click "📋 Start Review" button
   - Click "✅ Done" button
   - Check if status updates

### Test Jira Integration (if configured)

1. **Create Jira ticket from PR:**
   - Click "📝 Create Jira Ticket" button on PR message
   - Should create ticket in Jira

2. **Check auto-creation (if enabled):**
   - Open a new PR
   - Should automatically create Jira ticket

---

## 6. 🚨 Troubleshooting

### Slack Commands Not Working

- ✅ Check if bot is added to channel
- ✅ Verify Request URL is correct
- ✅ Check app logs for errors
- ✅ Ensure bot token has correct scopes

### GitHub Webhooks Not Working

- ✅ Verify webhook URL is correct
- ✅ Check webhook secret matches
- ✅ Look at GitHub webhook delivery logs
- ✅ Check app logs for incoming webhooks

### Jira Integration Not Working

- ✅ Verify API token is correct
- ✅ Check email matches Jira account
- ✅ Ensure project key exists
- ✅ Check Jira permissions

### Common Issues

**"Missing env var" error:**
- Check all required environment variables are set
- Restart the app after adding variables

**"not_in_channel" error:**
- Add bot to the channel
- Or use commands in DMs

**Webhook signature validation failed:**
- Check webhook secret matches in GitHub and env vars

---

## 7. 📝 Quick Start Commands

After setup, use these commands to get started:

```bash
# 1. Add yourself as admin (if not using workspace admins)
# Set ADMIN_SLACK_USER_IDS in environment variables

# 2. Add team members
/add-reviewer U01234567 alice FE
/add-reviewer U09876543 bob BE

# 3. Create a team (optional)
/create-team "Frontend Team" C0123456789

# 4. Map repository to team (optional)
/map-repo org/repo-name team_1234567890

# 5. Check everything works
/list-reviewers
/cr my
/metrics
```

---

## 🎉 You're All Set!

Once you complete these steps, ReviewFlow will:
- ✅ Automatically assign PRs to reviewers
- ✅ Send notifications to Slack
- ✅ Create Jira tickets (if configured)
- ✅ Send reminders for overdue reviews
- ✅ Track metrics and analytics

**Need help?** Check the logs in Railway/Render for detailed error messages.

