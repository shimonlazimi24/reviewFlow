# 🚀 Next Steps - Getting ReviewFlow Production Ready

## Phase 1: Local Setup & Testing (30 minutes)

### ✅ Step 1: Install Dependencies
```bash
cd reviewflow
npm install
```

### ✅ Step 2: Create Environment File
Create `.env` file in the root directory:

```bash
# Required
PORT=3000
SLACK_SIGNING_SECRET=your_slack_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your_bot_token_here
SLACK_DEFAULT_CHANNEL_ID=C0123456789

# Optional - GitHub
GITHUB_WEBHOOK_SECRET=your_optional_secret

# Optional - Jira
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=bot@your-company.com
JIRA_API_TOKEN=your_jira_api_token
JIRA_PROJECT_KEY=PROJ
JIRA_ISSUE_TYPE=Task
JIRA_DEFAULT_SPRINT_FIELD=customfield_10020
JIRA_AUTO_TRANSITION_ON_OPEN=false
JIRA_AUTO_TRANSITION_ON_MERGE=false
```

**How to get Slack credentials:**
1. Go to https://api.slack.com/apps
2. Create new app or select existing
3. **Bot Token:** OAuth & Permissions → Bot User OAuth Token (starts with `xoxb-`)
4. **Signing Secret:** Basic Information → App Credentials → Signing Secret
5. **Scopes needed:** `chat:write`, `commands`, `actions:read`, `users:read`
6. **Install app** to your workspace

**How to get Jira credentials:**
1. Go to https://id.atlassian.com/manage-profile/security/api-tokens
2. Create API token
3. Use your email + API token for authentication

### ✅ Step 3: Initialize Team Members

Edit `src/index.ts` and add this before `await slackApp.start()`:

```typescript
import { initializeTeamMembers } from './db/init';

// Initialize your team (add this in main() function)
initializeTeamMembers([
  {
    slackUserId: 'U01234567', // Get from Slack user profile → More → Member ID
    githubUsernames: ['alice', 'alice-dev'],
    roles: ['FE'], // 'FE', 'BE', or 'FS'
    weight: 1.0, // Lower = gets more assignments
    isActive: true
  },
  {
    slackUserId: 'U01234568',
    githubUsernames: ['bob'],
    roles: ['BE'],
    weight: 1.0,
    isActive: true
  },
  // Add more team members...
]);
```

**To find Slack User IDs:**
- Right-click user in Slack → View profile → More → Copy member ID
- Or use: https://api.slack.com/methods/users.list

### ✅ Step 4: Test Locally

```bash
# Start the server
npm run dev

# In another terminal, test health
npm run test:health

# Test webhook
npm run test:webhook
```

**Check:**
- ✅ Server starts without errors
- ✅ Health endpoint works
- ✅ Slack bot responds to `/my-reviews`
- ✅ Test PR message appears in Slack

---

## Phase 2: GitHub Integration (15 minutes)

### ✅ Step 5: Set Up GitHub Webhook

**Option A: Local Testing with ngrok**
```bash
# Install ngrok
brew install ngrok  # Mac
# or download from https://ngrok.com

# Start ngrok
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
```

**Option B: Production URL**
- Use your deployed server URL (see Phase 3)

### ✅ Step 6: Configure GitHub Webhook

1. Go to your GitHub repository
2. **Settings** → **Webhooks** → **Add webhook**
3. **Payload URL:** `https://your-domain.com/webhooks/github` (or ngrok URL)
4. **Content type:** `application/json`
5. **Secret:** (optional) Your `GITHUB_WEBHOOK_SECRET`
6. **Events:** Select "Pull requests"
7. **Active:** ✅ Checked
8. Click **Add webhook**

**Test it:**
- Create a test PR in your repo
- Check Slack channel for PR message

---

## Phase 3: Deploy to Production (1 hour)

### ✅ Step 7: Choose Deployment Platform

**Option A: Heroku (Easiest)**
```bash
# Install Heroku CLI
brew install heroku/brew/heroku

# Login
heroku login

# Create app
heroku create reviewflow-bot

# Set environment variables
heroku config:set SLACK_SIGNING_SECRET=xxx
heroku config:set SLACK_BOT_TOKEN=xoxb-xxx
heroku config:set SLACK_DEFAULT_CHANNEL_ID=C0123456789
# ... add all other env vars

# Deploy
git push heroku main
```

**Option B: Railway**
1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Add environment variables
4. Deploy

**Option C: DigitalOcean App Platform**
1. Go to https://cloud.digitalocean.com/apps
2. Create app from GitHub
3. Add environment variables
4. Deploy

**Option D: AWS/Google Cloud/Azure**
- Use their container/function services
- Set environment variables
- Configure webhook URL

### ✅ Step 8: Update GitHub Webhook URL

After deployment, update GitHub webhook to point to your production URL:
```
https://your-production-domain.com/webhooks/github
```

### ✅ Step 9: Build for Production

```bash
# Build TypeScript
npm run build

# Test production build locally
npm start
```

---

## Phase 4: Configuration & Customization (30 minutes)

### ✅ Step 10: Customize Settings

**Review assignment logic:**
- Edit `src/services/assignmentService.ts` to adjust reviewer selection
- Modify `pickReviewers()` function

**PR size thresholds:**
- Edit `src/utils/prSizing.ts` to change size calculations

**Slack message format:**
- Edit `src/slack/blocks.ts` to customize message appearance

**Jira integration:**
- Adjust transition names in `.env`
- Configure auto-transitions

### ✅ Step 11: Add More Team Members

Update the `initializeTeamMembers()` call in `src/index.ts` with your full team.

**Tips:**
- Set `weight` lower (0.5-0.8) for team leads who can handle more
- Set `weight` higher (1.0-1.5) for junior developers
- Use `isActive: false` to temporarily disable someone

---

## Phase 5: Monitoring & Maintenance (Ongoing)

### ✅ Step 12: Set Up Monitoring

**Add logging:**
- Consider adding Winston or Pino for better logging
- Set up error tracking (Sentry, Rollbar)

**Health checks:**
- Use `/health` endpoint for uptime monitoring
- Set up alerts if health check fails

### ✅ Step 13: Regular Maintenance

**Weekly:**
- Check logs for errors
- Verify team members are still active
- Update member weights if needed

**Monthly:**
- Review assignment distribution
- Adjust reviewer selection algorithm if needed
- Update dependencies: `npm update`

---

## Quick Checklist

### Setup
- [ ] Installed dependencies (`npm install`)
- [ ] Created `.env` file with all credentials
- [ ] Initialized team members in `src/index.ts`
- [ ] Tested locally (`npm run dev`)

### Integration
- [ ] Slack bot responds to commands
- [ ] GitHub webhook configured
- [ ] Test PR creates Slack message
- [ ] Jira integration works (if using)

### Deployment
- [ ] Chosen deployment platform
- [ ] Environment variables set in production
- [ ] Application deployed
- [ ] GitHub webhook points to production URL
- [ ] Health check endpoint accessible

### Production
- [ ] Team members configured
- [ ] Monitoring set up
- [ ] Error tracking configured
- [ ] Documentation shared with team

---

## Need Help?

**Common Issues:**
- **Bot not responding:** Check token, scopes, and channel permissions
- **Webhook not working:** Verify URL, secret, and GitHub event types
- **No reviewers assigned:** Check team member initialization
- **Jira errors:** Verify credentials and project key

**Resources:**
- `QUICKSTART.md` - Quick testing guide
- `TESTING.md` - Detailed testing instructions
- Check console logs for specific error messages

---

## 🎉 You're Ready!

Once all checkboxes are done, your ReviewFlow bot is production-ready and will:
- ✅ Automatically assign reviewers to PRs
- ✅ Post PR notifications to Slack
- ✅ Create Jira tickets on demand
- ✅ Track review completion
- ✅ Manage sprint assignments

**Start with Phase 1 and work through each phase step by step!**


