# Testing Guide for ReviewFlow

## Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the root directory with:
   ```bash
   PORT=3000
   SLACK_SIGNING_SECRET=your_slack_signing_secret
   SLACK_BOT_TOKEN=xoxb-your_bot_token
   SLACK_DEFAULT_CHANNEL_ID=C0123456789
   
   # Optional: Jira
   JIRA_BASE_URL=https://your-company.atlassian.net
   JIRA_EMAIL=bot@your-company.com
   JIRA_API_TOKEN=your_api_token
   JIRA_PROJECT_KEY=PROJ
   JIRA_ISSUE_TYPE=Task
   ```

3. **Initialize team members:**
   You need to populate the database with team members. See `src/db/init.ts` for examples.

## Testing Steps

### 1. Start the Application

```bash
npm run dev
```

You should see:
```
⚡ ReviewFlow running on port 3000
📊 Health check: http://localhost:3000/health
🔗 GitHub webhook: http://localhost:3000/webhooks/github
```

### 2. Test Health Endpoint

Open your browser or use curl:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 123.45
}
```

### 3. Test Slack Integration

#### Test Slack Bot Connection
- Go to your Slack workspace
- Invite the bot to a channel using `/invite @YourBotName`
- The bot should appear online

#### Test `/my-reviews` Command
In Slack, type:
```
/my-reviews
```

Expected: You should see a message (even if empty: "✅ You have no pending reviews!")

#### Test `/create-jira` Command (if Jira is configured)
In Slack, type:
```
/create-jira Test ticket
This is a test description
```

Expected: A Jira ticket should be created and you'll get a confirmation message.

### 4. Test GitHub Webhook

#### Option A: Using ngrok (for local testing)
1. Install ngrok: `brew install ngrok` (Mac) or download from ngrok.com
2. Start ngrok: `ngrok http 3000`
3. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)
4. Configure GitHub webhook:
   - Go to your GitHub repository → Settings → Webhooks
   - Add webhook: `https://abc123.ngrok.io/webhooks/github`
   - Content type: `application/json`
   - Events: Select "Pull requests"
   - Secret: (optional) your `GITHUB_WEBHOOK_SECRET`

#### Option B: Using curl (simulate webhook)
```bash
curl -X POST http://localhost:3000/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: pull_request" \
  -d @test-webhook.json
```

Create `test-webhook.json`:
```json
{
  "action": "opened",
  "pull_request": {
    "number": 123,
    "title": "Test PR",
    "html_url": "https://github.com/user/repo/pull/123",
    "user": {
      "login": "testuser"
    },
    "head": {
      "ref": "feature/PROJ-123-test"
    },
    "labels": [
      {"name": "frontend"}
    ],
    "additions": 50,
    "deletions": 10
  },
  "repository": {
    "full_name": "user/repo"
  }
}
```

Expected: 
- Check your Slack channel - you should see a PR message
- Check console logs for any errors

### 5. Test PR Actions

1. **Create a test PR** in your GitHub repository
2. **Check Slack** - you should see a message with:
   - PR details
   - Assigned reviewers
   - "Create Jira Ticket" button (if no Jira ticket linked)

3. **Click "Create Jira Ticket" button**:
   - Should create a Jira ticket
   - Should update the Slack message with Jira link
   - Should add ticket to active sprint (if available)

4. **Click "✅ Done" button** (if you're assigned):
   - Should mark your review as done
   - Should update the message

### 6. Test Database Operations

You can test the database by adding this to `src/index.ts` temporarily:

```typescript
import { initializeTeamMembers } from './db/init';

// In main() function, before starting the server:
initializeTeamMembers([
  {
    slackUserId: 'U01234567', // Replace with real Slack user ID
    githubUsernames: ['your-github-username'],
    roles: ['FE'],
    weight: 1.0,
    isActive: true
  }
]);
```

### 7. Check Logs

Watch the console for:
- ✅ Success messages
- ⚠️ Warnings (non-critical)
- ❌ Errors (need attention)

Common issues:
- `Missing env var: SLACK_SIGNING_SECRET` → Check your .env file
- `Jira error: ...` → Jira might not be configured or credentials wrong
- `Failed to update Slack message` → Bot might not have permissions

## Troubleshooting

### Bot not responding in Slack
- Check bot token is correct
- Verify bot is invited to the channel
- Check bot has necessary scopes: `chat:write`, `commands`, `actions:read`

### GitHub webhook not working
- Verify webhook URL is correct
- Check webhook secret matches (if configured)
- Look at GitHub webhook delivery logs
- Check application logs for errors

### Jira not working
- Verify JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN are correct
- Test Jira API access manually:
  ```bash
  curl -u email:token https://your-company.atlassian.net/rest/api/3/myself
  ```
- Check JIRA_PROJECT_KEY exists
- Verify sprint field ID (usually `customfield_10020`)

### No reviewers assigned
- Make sure team members are initialized in the database
- Check member `isActive` is `true`
- Verify member roles match PR stack (FE/BE/FS)

## Quick Verification Checklist

- [ ] Application starts without errors
- [ ] Health endpoint returns OK
- [ ] Slack bot responds to `/my-reviews`
- [ ] GitHub webhook receives events (check logs)
- [ ] PR messages appear in Slack
- [ ] Jira ticket creation works (if configured)
- [ ] Review completion buttons work
- [ ] Database operations work (members, PRs, assignments)


