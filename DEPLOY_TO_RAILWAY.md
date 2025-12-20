# Deploy ReviewFlow to Railway

## Why Railway? ✅

- ✅ **No sleep** - Always awake, instant responses
- ✅ **$5 free credit/month** - Usually enough for small bots
- ✅ **Super easy setup** - Auto-detects everything
- ✅ **Perfect for webhooks** - Always responsive
- ✅ **Auto-deploys** from GitHub

## Step-by-Step Deployment

### Step 1: Push Code to GitHub

If you haven't already:

```bash
cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow

# Check if git is initialized
git status

# If not initialized:
git init
git add .
git commit -m "Initial ReviewFlow commit"

# Create a new repository on GitHub:
# 1. Go to https://github.com/new
# 2. Name it: reviewflow
# 3. Don't initialize with README (we have files)
# 4. Click "Create repository"

# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/reviewflow.git
git branch -M main
git push -u origin main
```

**Important:** Make sure `.env` is in `.gitignore` (we already added it)!

### Step 2: Sign Up for Railway

1. Go to: https://railway.app
2. Click **"Start a New Project"** or **"Login"**
3. Sign up with **GitHub** (recommended - easiest)
4. Authorize Railway to access your GitHub

### Step 3: Create New Project

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. If prompted, authorize Railway to access your GitHub
4. Find and select your **reviewflow** repository
5. Click **"Deploy Now"**

### Step 4: Railway Auto-Detection

Railway will automatically:
- ✅ Detect it's a Node.js project
- ✅ Find `package.json`
- ✅ Run `npm install`
- ✅ Run `npm run build` (if build script exists)
- ✅ Run `npm start` (or detect start command)

**You don't need to configure anything!** Railway is smart. 🎉

### Step 5: Add Environment Variables

1. In Railway dashboard, click on your **reviewflow** service
2. Go to **"Variables"** tab
3. Click **"New Variable"**
4. Add each variable:

**Required Variables:**
```
PORT=3000
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your_bot_token_here
SLACK_DEFAULT_CHANNEL_ID=your_channel_id_here
```

**Optional Variables:**
```
GITHUB_WEBHOOK_SECRET=your_optional_secret
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=bot@your-company.com
JIRA_API_TOKEN=your_jira_token
JIRA_PROJECT_KEY=PROJ
JIRA_ISSUE_TYPE=Task
JIRA_DEFAULT_SPRINT_FIELD=customfield_10020
JIRA_AUTO_TRANSITION_ON_OPEN=false
JIRA_AUTO_TRANSITION_ON_MERGE=false
JIRA_OPEN_TRANSITION_NAME=In Review
JIRA_MERGE_TRANSITION_NAME=Done
```

**Tip:** You can copy all variables from your `.env` file and paste them one by one.

### Step 6: Wait for Deployment

1. Railway will automatically:
   - Install dependencies
   - Build the project (`npm run build`)
   - Start the server (`npm start`)
2. Watch the **"Deployments"** tab for progress
3. Wait 2-3 minutes for first deployment
4. You'll see build logs in real-time

### Step 7: Get Your URL

After deployment succeeds:

1. Go to **"Settings"** tab
2. Scroll to **"Domains"** section
3. You'll see your Railway URL: `https://reviewflow-production.up.railway.app`
   - Or click **"Generate Domain"** for a custom name
4. **Copy this URL** - you'll need it!

### Step 8: Update Slack App Settings

1. Go to: https://api.slack.com/apps → Your App

2. **Slash Commands:**
   - Go to **"Slash Commands"**
   - For `/my-reviews`:
     - Request URL: `https://your-railway-url.railway.app/slack/events`
   - For `/create-jira`:
     - Request URL: `https://your-railway-url.railway.app/slack/events`
   - Click **"Save"** for each

3. **Event Subscriptions** (if using):
   - Go to **"Event Subscriptions"**
   - Request URL: `https://your-railway-url.railway.app/slack/events`
   - Enable Events

### Step 9: Update GitHub Webhook

1. Go to your GitHub repo → **Settings** → **Webhooks**
2. Click **"Add webhook"**
3. Configure:
   - **Payload URL:** `https://your-railway-url.railway.app/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** (your `GITHUB_WEBHOOK_SECRET` if set)
   - **Which events:** Select "Pull requests"
   - **Active:** ✅ Checked
4. Click **"Add webhook"**

### Step 10: Test Everything!

1. **Test health endpoint:**
   ```bash
   curl https://your-railway-url.railway.app/health
   ```
   Should return: `{"status":"OK",...}`

2. **Test in Slack:**
   ```
   /my-reviews
   ```
   Bot should respond!

3. **Test with GitHub:**
   - Create a test PR in your repo
   - Check Slack channel for PR notification!

## Troubleshooting

### Build Fails

**Check logs:**
- Railway dashboard → Your service → **"Deployments"** → Click latest → **"View Logs"**

**Common issues:**
- Missing `build` script → Check `package.json`
- TypeScript errors → Check `tsconfig.json`
- Missing dependencies → Check `package.json` dependencies

**Fix:**
- Check the error in logs
- Fix the issue locally
- Push to GitHub (Railway auto-redeploys)

### Service Won't Start

**Check:**
- Environment variables are set correctly
- `PORT` variable is set (Railway sets this automatically, but check)
- `npm start` command works (test locally first)

**View logs:**
- Railway dashboard → Service → **"Deployments"** → **"View Logs"**

### Environment Variables Not Working

- Make sure you saved them in Railway dashboard
- Variable names must match exactly (case-sensitive)
- Restart service: **"Deployments"** → **"Redeploy"**

### 404 Errors

- Make sure your routes are correct
- Check that server started successfully
- Verify the URL is correct

## Updating Your App

**Automatic (default):**
- Just push to GitHub
- Railway auto-detects changes
- Auto-deploys new version

**Manual redeploy:**
- Railway dashboard → **"Deployments"** → **"Redeploy"**

## Monitoring

**View logs:**
- Railway dashboard → Service → **"Deployments"** → **"View Logs"**
- Real-time logs
- Historical logs

**Metrics:**
- CPU usage
- Memory usage
- Network traffic
- Response times

## Cost

**Free Tier:**
- $5 credit/month
- Usually enough for small bots
- No sleep (always awake!)
- Perfect for ReviewFlow

**Paid Plans:**
- **Hobby:** $5/month - More resources
- **Pro:** $20/month - Production grade
- **Team:** Custom pricing

**For ReviewFlow:** Free tier is usually sufficient!

## Custom Domain (Optional)

1. Railway dashboard → Service → **"Settings"**
2. **"Domains"** section
3. Click **"Custom Domain"**
4. Add your domain
5. Update DNS records as instructed

## Next Steps After Deployment

1. ✅ Test health endpoint
2. ✅ Configure Slack commands
3. ✅ Set up GitHub webhook
4. ✅ Initialize team members (add to `src/index.ts`)
5. ✅ Test with real PR
6. ✅ Share with your team!

## Pro Tips

1. **Use Railway CLI** (optional):
   ```bash
   npm i -g @railway/cli
   railway login
   railway link
   railway up
   ```

2. **Monitor usage:**
   - Railway dashboard → **"Usage"** tab
   - Track your $5 free credit

3. **Set up alerts:**
   - Railway dashboard → **"Settings"** → **"Notifications"**
   - Get notified of deployments and errors

## Summary

Railway is perfect for ReviewFlow because:
- ✅ No sleep = instant webhook responses
- ✅ Auto-detects everything
- ✅ Free tier is sufficient
- ✅ Easy to use
- ✅ Great for bots

**Your ReviewFlow will be live at:** `https://your-app.railway.app`

Ready to deploy? Follow the steps above! 🚀

