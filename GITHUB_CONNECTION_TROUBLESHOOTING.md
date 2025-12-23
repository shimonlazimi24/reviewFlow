# GitHub Connection Troubleshooting Guide

## Common Issues and Solutions

### Issue 1: GitHub App Not Configured

**Symptoms:**
- Clicking "GitHub" button shows a page with installation instructions
- No redirect to GitHub App installation page

**Solution:**
1. Check if `GITHUB_APP_ID` is set in your environment variables
2. Check if `GITHUB_APP_NAME` is set (defaults to 'reviewflow')
3. Verify your GitHub App exists at: https://github.com/settings/apps

**To set up GitHub App:**
1. Go to https://github.com/settings/apps/new
2. Fill in:
   - **GitHub App name**: `reviewflow` (or your custom name)
   - **Homepage URL**: Your app URL (e.g., `https://reviewflow-production.up.railway.app`)
   - **Callback URL**: `https://reviewflow-production.up.railway.app/connect/github/callback`
   - **Webhook URL**: `https://reviewflow-production.up.railway.app/webhooks/github`
   - **Webhook secret**: Set `GITHUB_WEBHOOK_SECRET` in your environment
3. Set permissions:
   - **Repository permissions**:
     - Pull requests: Read & Write
     - Contents: Read-only
     - Metadata: Read-only
   - **Subscribe to events**:
     - Pull request
     - Push
4. Save and note your **App ID** and **App name**
5. Generate a **private key** and save it
6. Set environment variables:
   ```bash
   GITHUB_APP_ID=your_app_id_here
   GITHUB_APP_NAME=reviewflow
   GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
   GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
   ```

### Issue 2: Installation Callback Not Received

**Symptoms:**
- Installation completes on GitHub
- But Home Tab still shows "Not connected"
- No logs showing "GitHub installation callback received"

**Solution:**
1. **Verify callback URL in GitHub App settings:**
   - Go to https://github.com/settings/apps
   - Click your app
   - Under "User authorization callback URL", ensure it's:
     ```
     https://reviewflow-production.up.railway.app/connect/github/callback
     ```
   - Make sure there's no trailing slash

2. **Check your app logs** for:
   ```
   GitHub installation callback received
   ```
   If you don't see this, the callback isn't reaching your app.

3. **Verify APP_BASE_URL is correct:**
   ```bash
   APP_BASE_URL=https://reviewflow-production.up.railway.app
   ```
   (No trailing slash)

4. **Test the callback URL manually:**
   ```
   https://reviewflow-production.up.railway.app/connect/github/callback?installation_id=123&state=workspace_xxx
   ```
   You should see an error page (expected), but it confirms the route is accessible.

### Issue 3: Installation ID Not Saved

**Symptoms:**
- Callback is received (you see logs)
- But Home Tab still shows "Not connected"
- Installation ID exists in logs but not in database

**Solution:**
1. **Check if workspace exists:**
   - The callback tries to find workspace by `state` parameter
   - If `state` is missing or incorrect, it won't link properly
   - Check logs for: `Workspace not found from state`

2. **Manual verification:**
   - After installation, check your app logs for:
     ```
     GitHub installation connected to workspace
     ```
   - If you see this, the connection is saved
   - Try clicking "🔄 Refresh" in Home Tab

3. **Check database:**
   - If using in-memory database, data is lost on restart
   - Set `DATABASE_URL` for persistent storage

### Issue 4: State Parameter Missing

**Symptoms:**
- Installation completes
- But callback can't find workspace
- Logs show: `Workspace not found from state`

**Solution:**
1. **Verify the installation URL includes state:**
   ```
   https://github.com/apps/reviewflow/installations/new?state=workspace_T0A4D4NF3RD
   ```
   The `state` parameter should be your `workspace.id`

2. **Check the modal button URL:**
   - When you click "GitHub" button, the modal should have a button with URL like:
     ```
     https://github.com/apps/reviewflow/installations/new?state=workspace_T0A4D4NF3RD
     ```
   - If `state` is missing, the callback won't know which workspace to update

### Issue 5: GitHub App Name Mismatch

**Symptoms:**
- Installation URL redirects to wrong app
- Or shows 404 on GitHub

**Solution:**
1. **Verify GITHUB_APP_NAME matches your actual app name:**
   - Go to https://github.com/settings/apps
   - Find your app and check its name (case-sensitive)
   - Set `GITHUB_APP_NAME` to match exactly

2. **Test the installation URL:**
   ```
   https://github.com/apps/YOUR_APP_NAME/installations/new
   ```
   Replace `YOUR_APP_NAME` with your actual app name

## Step-by-Step Connection Process

1. **Click "GitHub" button** in ReviewFlow Home Tab
2. **Modal opens** with "Install GitHub App" button
3. **Click the button** - should redirect to GitHub
4. **On GitHub:**
   - Select repositories (or "All repositories")
   - Click "Install"
5. **GitHub redirects** to `/connect/github/callback?installation_id=xxx&state=workspace_xxx`
6. **Your app:**
   - Receives callback
   - Finds workspace by `state`
   - Saves `installation_id` to workspace
   - Shows success page
7. **Return to Slack:**
   - Click "🔄 Refresh" in Home Tab
   - Should see "✅ Connected" with installation ID

## Debugging Checklist

- [ ] `GITHUB_APP_ID` is set in environment
- [ ] `GITHUB_APP_NAME` matches your GitHub App name exactly
- [ ] `APP_BASE_URL` is set correctly (no trailing slash)
- [ ] GitHub App callback URL is: `{APP_BASE_URL}/connect/github/callback`
- [ ] GitHub App webhook URL is: `{APP_BASE_URL}/webhooks/github`
- [ ] Installation URL includes `state` parameter
- [ ] Callback is being received (check logs)
- [ ] Workspace is found by `state` parameter
- [ ] Installation ID is saved to workspace
- [ ] Home Tab is refreshed after connection

## Manual Connection (If Automatic Fails)

If the automatic flow doesn't work, you can manually link an installation:

1. **Get your installation ID:**
   - Go to https://github.com/settings/installations
   - Find your ReviewFlow installation
   - The URL will be: `https://github.com/settings/installations/12345678`
   - The number at the end is your installation ID

2. **Use the GitHub webhook:**
   - The installation webhook should automatically link it
   - Or wait for the next PR event (which will also link it)

3. **Check logs:**
   - Look for: `GitHub installation linked to workspace`
   - This confirms the connection

## Still Not Working?

1. **Check app logs** for errors
2. **Verify environment variables** are set correctly
3. **Test callback URL** manually (should return error, not 404)
4. **Check GitHub App settings** - callback URL must match exactly
5. **Try reinstalling** the GitHub App on GitHub

