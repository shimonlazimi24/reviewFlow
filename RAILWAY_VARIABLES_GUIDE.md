# How to Add Environment Variables in Railway

## Step-by-Step Navigation

### Step 1: Open Your Project
1. Go to: https://railway.app
2. You should see your dashboard with projects
3. Click on your **reviewFlow** project (or the project name you created)

### Step 2: Find Your Service
1. Inside your project, you'll see a service (usually named after your repo or "web")
2. Click on the **service card/box** (the deployed application)

### Step 3: Find Variables Tab
Once you're inside the service, look for tabs at the top:
- **Deployments** (shows deployment history)
- **Metrics** (shows usage stats)
- **Settings** (service settings)
- **Variables** ← **THIS IS WHAT YOU NEED!**

If you don't see "Variables" tab, try:
- Look for **"Environment"** or **"Env"** tab
- Or click **"Settings"** and look for "Environment Variables" section

### Step 4: Add Variables
1. Click **"Variables"** tab
2. Click **"New Variable"** or **"Add Variable"** button
3. Enter:
   - **Name:** `SLACK_SIGNING_SECRET`
   - **Value:** `e7880e0baa08ec5df4dff2ea7a271f2f`
4. Click **"Add"** or **"Save"**
5. Repeat for each variable

## Alternative: Using Railway Dashboard Layout

Railway's interface might look like this:

```
┌─────────────────────────────────────┐
│  Railway Dashboard                  │
├─────────────────────────────────────┤
│  Projects                           │
│  ┌───────────────────────────────┐  │
│  │  reviewFlow                   │  │ ← Click here
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

Then inside project:
┌─────────────────────────────────────┐
│  reviewFlow Project                 │
├─────────────────────────────────────┤
│  ┌───────────────────────────────┐  │
│  │  Service: reviewflow          │  │ ← Click here
│  │  Status: Deploying...         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘

Then inside service:
┌─────────────────────────────────────┐
│  [Deployments] [Variables] [Settings]│ ← Click Variables
├─────────────────────────────────────┤
│  Environment Variables              │
│  ┌───────────────────────────────┐  │
│  │  + New Variable               │  │ ← Click here
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## If You Still Can't Find It

### Option 1: Check Service Settings
1. Click on your service
2. Click **"Settings"** tab
3. Look for **"Environment Variables"** or **"Variables"** section
4. There should be an **"Add Variable"** button

### Option 2: Use Railway CLI
If the web interface is confusing, use the CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Add variables
railway variables set SLACK_SIGNING_SECRET=your_signing_secret_here
railway variables set SLACK_BOT_TOKEN=xoxb-your_bot_token_here
railway variables set SLACK_DEFAULT_CHANNEL_ID=your_channel_id_here
railway variables set PORT=3000
```

### Option 3: Check Project Level
Sometimes variables are at the **project level**, not service level:
1. Go back to your project (not the service)
2. Look for **"Variables"** or **"Environment"** tab at project level
3. Add variables there

## What You Should See

When you find the Variables section, you should see:
- A list of existing variables (might be empty)
- A button: **"New Variable"**, **"Add Variable"**, or **"+"**
- Fields for **Name** and **Value**

## Quick Checklist

- [ ] Logged into Railway
- [ ] Opened your project
- [ ] Clicked on the service/deployment
- [ ] Found "Variables" tab (or "Settings" → "Environment Variables")
- [ ] Clicked "New Variable"
- [ ] Added all 4 required variables

## Still Stuck?

Describe what you see:
1. What tabs do you see when you click on your service?
2. Are you looking at the project level or service level?
3. Can you see "Settings" tab? What's inside it?

I can help you navigate based on what you're seeing!

