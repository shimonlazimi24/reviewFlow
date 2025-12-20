# Quick Start - How to Verify ReviewFlow is Working

## Step 1: Install & Setup (5 minutes)

```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example or create manually)
# Add your Slack and Jira credentials
```

## Step 2: Start the Server

```bash
npm run dev
```

**✅ Success looks like:**
```
⚡ ReviewFlow running on port 3000
📊 Health check: http://localhost:3000/health
🔗 GitHub webhook: http://localhost:3000/webhooks/github
```

**❌ If you see errors:**
- `Missing env var: ...` → Check your `.env` file
- `Failed to start` → Check Slack token and signing secret

## Step 3: Quick Tests (2 minutes)

### Test 1: Health Check
Open in browser: http://localhost:3000/health

**Expected:** JSON with `{"status": "OK", ...}`

Or use command:
```bash
npm run test:health
```

### Test 2: Slack Bot
1. Go to your Slack workspace
2. Type: `/my-reviews`
3. **Expected:** Bot responds (even if "no pending reviews")

**❌ If bot doesn't respond:**
- Check bot token in `.env`
- Verify bot is invited to the channel
- Check bot has `commands` scope

### Test 3: GitHub Webhook (Optional)
```bash
npm run test:webhook
```

**Expected:** `ok` or `ignored` response

Then check your Slack channel - you should see a test PR message!

## Step 4: Real Test - Create a PR

1. **Create a test PR** in your GitHub repo
2. **Configure webhook** (if not done):
   - GitHub repo → Settings → Webhooks
   - URL: `https://your-domain.com/webhooks/github` (or use ngrok for local)
   - Events: Pull requests
3. **Check Slack** - PR message should appear!

## Step 5: Test Jira Integration (if configured)

### In Slack:
```
/create-jira Test ticket from ReviewFlow
This is a test description
```

**Expected:** 
- ✅ Confirmation message with Jira ticket link
- Ticket created in your Jira project
- Added to active sprint (if available)

### Or click button on PR message:
- Click "📝 Create Jira Ticket" button
- Should create ticket and update message

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Bot not responding | Check `SLACK_BOT_TOKEN` and bot permissions |
| Webhook not working | Verify webhook URL and GitHub secret |
| No reviewers assigned | Initialize team members (see `src/db/init.ts`) |
| Jira errors | Check `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` |
| Port already in use | Change `PORT` in `.env` |

## What to Check

✅ **Server running** - See startup messages  
✅ **Health endpoint** - Returns OK  
✅ **Slack commands** - `/my-reviews` works  
✅ **PR messages** - Appear in Slack  
✅ **Jira creation** - Tickets created successfully  
✅ **Buttons work** - Can mark reviews done  

## Need Help?

- Check `TESTING.md` for detailed testing guide
- Check console logs for error messages
- Verify all environment variables are set correctly

