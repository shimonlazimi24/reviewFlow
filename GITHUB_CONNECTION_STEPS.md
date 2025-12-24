# Step-by-Step: Connect GitHub to ReviewFlow

## What the Logs Show

From your logs, I can see:
- ✅ GitHub button was clicked
- ✅ GitHub connect route was called
- ✅ Workspace was found
- ❌ **No callback log** - This means the GitHub App installation wasn't completed

## Complete These Steps

### Step 1: Click GitHub Button in Slack

1. Go to ReviewFlow Home Tab
2. Click "🐙 GitHub" button
3. Modal opens with "📦 Install GitHub App" button

### Step 2: Install GitHub App on GitHub

1. **Click "📦 Install GitHub App"** button in the modal
2. You'll be redirected to GitHub
3. **Select repositories:**
   - Choose "All repositories" OR
   - Select specific repositories (e.g., `shimonlazimi24/reviewFlow`)
4. **Click "Install"** button on GitHub

### Step 3: Verify Callback

After clicking "Install" on GitHub, you should:
1. Be redirected to: `https://reviewflow-production.up.railway.app/connect/github/callback?installation_id=xxx&state=workspace_xxx`
2. See a success page saying "✅ GitHub Connected Successfully!"
3. **Check your app logs** - you should see:
   ```
   GitHub installation callback received
   GitHub installation connected to workspace
   ```

### Step 4: Return to Slack

1. Click "Return to Slack" link on the success page
2. Go to ReviewFlow Home Tab
3. Click "🔄 Refresh" button
4. GitHub status should now show: "✅ Connected" with installation ID

## Troubleshooting

### If you don't see the callback log:

1. **Check GitHub App Settings:**
   - Go to: https://github.com/settings/apps
   - Find your ReviewFlow app
   - Check "User authorization callback URL":
     ```
     https://reviewflow-production.up.railway.app/connect/github/callback
     ```
   - **Must match exactly** (no trailing slash)

2. **Verify environment variables:**
   ```bash
   APP_BASE_URL=https://reviewflow-production.up.railway.app
   GITHUB_APP_ID=your_app_id
   GITHUB_APP_NAME=reviewflow  # Must match your GitHub App name
   ```

3. **Check if installation completed:**
   - Go to: https://github.com/settings/installations
   - Look for your ReviewFlow installation
   - If it exists, the installation ID should be in the URL

4. **Manual linking (if callback doesn't work):**
   - The installation webhook should automatically link it
   - Check logs for: `GitHub installation linked to workspace`
   - This happens when GitHub sends the installation webhook

### If callback URL is wrong:

1. Go to GitHub App settings
2. Update "User authorization callback URL" to:
   ```
   https://reviewflow-production.up.railway.app/connect/github/callback
   ```
3. Save changes
4. Try installing again

## Expected Log Sequence

When everything works correctly, you should see:

```
[INFO] GitHub button clicked from Home Tab
[INFO] GitHub connect route called
[INFO] Workspace found/created, proceeding with GitHub connection
[INFO] GitHub installation callback received  ← This is what's missing!
[INFO] GitHub installation connected to workspace
```

## Next Steps After Connection

Once GitHub is connected:
1. Create a team: `/create-team MyTeam #all-reviewflow`
2. Add reviewers: `/cr add-reviewer @username github:githubusername`
3. Map repository: `/map-repo shimonlazimi24/reviewFlow team_xxx`
4. Enable Go Live: Click "🚀 Go Live" in Home Tab
5. Test with a PR!

