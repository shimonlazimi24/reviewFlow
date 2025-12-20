# Deploy ReviewFlow to Render

## Why Render?

✅ **Free tier available** (with limitations)  
✅ **Very easy setup** - Just connect GitHub  
✅ **Auto-deploys** on git push  
✅ **Perfect for Node.js apps**  
✅ **HTTPS included**  
✅ **No credit card required** for free tier  

## Render Free Tier Limits

- **750 hours/month** (enough for 24/7 if you're the only user)
- **512 MB RAM**
- **Auto-sleeps after 15 min inactivity** (wakes on first request)
- **Free SSL certificate**

**Note:** Free tier services sleep after inactivity, so first request after sleep takes ~30 seconds to wake up.

## Step-by-Step Deployment

### Step 1: Push Code to GitHub

If you haven't already:

```bash
cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow

# Initialize git (if not already done)
git init

# Create .gitignore (if not exists)
# Make sure .env is in .gitignore!

# Add and commit
git add .
git commit -m "Initial ReviewFlow commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/reviewflow.git
git branch -M main
git push -u origin main
```

### Step 2: Sign Up for Render

1. Go to: https://render.com
2. Click **"Get Started for Free"**
3. Sign up with **GitHub** (recommended - easier integration)
4. Authorize Render to access your GitHub

### Step 3: Create New Web Service

1. In Render dashboard, click **"New +"**
2. Select **"Web Service"**
3. Connect your GitHub account (if not already)
4. Select your **reviewflow** repository
5. Click **"Connect"**

### Step 4: Configure Service

**Basic Settings:**
- **Name:** `reviewflow` (or any name you like)
- **Region:** Choose closest to you (e.g., `Oregon (US West)`)
- **Branch:** `main`
- **Root Directory:** (leave empty - root is fine)
- **Runtime:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`

**Advanced Settings (optional):**
- **Auto-Deploy:** `Yes` (deploys on every git push)
- **Health Check Path:** `/health`

### Step 5: Add Environment Variables

Click **"Environment"** tab and add:

**Required:**
```
PORT=3000
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your_bot_token_here
SLACK_DEFAULT_CHANNEL_ID=your_channel_id_here
```

**Optional:**
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

**Important:** 
- Click **"Save Changes"** after adding each variable
- Never commit `.env` to GitHub - use Render's environment variables

### Step 6: Deploy

1. Click **"Create Web Service"**
2. Render will:
   - Clone your repo
   - Install dependencies
   - Build the project
   - Start the server
3. Wait 2-5 minutes for first deployment
4. You'll see build logs in real-time

### Step 7: Get Your URL

After deployment succeeds:
- Your app will be at: `https://reviewflow.onrender.com` (or your custom name)
- Copy this URL - you'll need it for Slack/GitHub configuration

### Step 8: Update Slack App Settings

1. Go to: https://api.slack.com/apps → Your App
2. **Slash Commands:**
   - `/my-reviews` → Request URL: `https://reviewflow.onrender.com/slack/events`
   - `/create-jira` → Request URL: `https://reviewflow.onrender.com/slack/events`
3. **Event Subscriptions** (if using):
   - Request URL: `https://reviewflow.onrender.com/slack/events`

### Step 9: Update GitHub Webhook

1. Go to your GitHub repo → **Settings** → **Webhooks**
2. Add webhook:
   - **Payload URL:** `https://reviewflow.onrender.com/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** (your `GITHUB_WEBHOOK_SECRET` if set)
   - **Events:** Select "Pull requests"
3. Click **"Add webhook"**

### Step 10: Test!

1. **Test health endpoint:**
   ```bash
   curl https://reviewflow.onrender.com/health
   ```

2. **Test in Slack:**
   ```
   /my-reviews
   ```

3. **Test with GitHub:**
   - Create a test PR
   - Check Slack channel for notification

## Troubleshooting

### Service Won't Start

**Check logs:**
- Render dashboard → Your service → **Logs** tab
- Look for error messages

**Common issues:**
- Missing environment variables → Add them in Render dashboard
- Build errors → Check `package.json` scripts
- Port issues → Make sure `PORT` env var is set

### Service Sleeps (Free Tier)

**Problem:** First request after 15 min inactivity is slow (~30 sec)

**Solutions:**
1. **Upgrade to paid plan** ($7/month) - no sleep
2. **Use a ping service** to keep it awake:
   - https://uptimerobot.com (free)
   - Ping your `/health` endpoint every 5 minutes
3. **Accept the delay** - it's free!

### Build Fails

**Check:**
- `package.json` has correct scripts
- `tsconfig.json` is configured
- All dependencies are in `package.json`
- Build command: `npm install && npm run build`

### Environment Variables Not Working

- Make sure you saved them in Render dashboard
- Check variable names match exactly (case-sensitive)
- Restart service after adding variables

## Updating Your App

**Automatic (if enabled):**
- Just push to GitHub
- Render auto-deploys

**Manual:**
- Render dashboard → **Manual Deploy** → **Deploy latest commit**

## Monitoring

**View logs:**
- Render dashboard → Your service → **Logs** tab
- Real-time logs
- Historical logs

**Metrics:**
- CPU usage
- Memory usage
- Request count
- Response times

## Cost

**Free Tier:**
- 750 hours/month
- 512 MB RAM
- Auto-sleep after inactivity
- Perfect for testing/small teams

**Paid Plans:**
- **Starter:** $7/month - No sleep, 512 MB RAM
- **Standard:** $25/month - 2 GB RAM, better performance
- **Pro:** Custom pricing - Production grade

## Next Steps After Deployment

1. ✅ Test health endpoint
2. ✅ Configure Slack commands
3. ✅ Set up GitHub webhook
4. ✅ Initialize team members (add to `src/index.ts`)
5. ✅ Test with real PR

## Custom Domain (Optional)

1. Render dashboard → Your service → **Settings**
2. **Custom Domains** section
3. Add your domain
4. Update DNS records as instructed

## Summary

Render is an excellent choice for ReviewFlow because:
- ✅ Free tier to get started
- ✅ Very easy setup
- ✅ Auto-deploys from GitHub
- ✅ Perfect for Node.js
- ✅ HTTPS included
- ✅ Good documentation

**Your ReviewFlow will be live at:** `https://reviewflow.onrender.com`

Ready to deploy? Follow the steps above! 🚀

