# Fix: Home Tab Buttons (GitHub/Jira/Billing) Not Working

## Problem
The GitHub, Jira, and Billing buttons in the Home Tab don't work when clicked.

## Quick Fixes

### Fix 1: Check App Logs
When you click a button, check your app logs. You should see:
```
[INFO] GitHub button clicked from Home Tab { hasTeam: true, hasTriggerId: true, ... }
```

**If you see `hasTriggerId: false`:**
- This means Interactivity might not be enabled
- See Fix 2 below

### Fix 2: Verify Interactivity is Enabled
Home Tab buttons require **Interactivity** to be enabled:

1. Go to: https://api.slack.com/apps → Your App
2. Click **"Interactivity & Shortcuts"**
3. Make sure **"Interactivity"** is **ON** ✅
4. **Request URL**: `https://your-app-url.com/slack/events`
5. Click **"Save Changes"**
6. **Reinstall** the app if you just enabled it

### Fix 3: Use Alternative Methods

If buttons still don't work, use these alternatives:

**For GitHub:**
- Type: `/cr settings` → Click "Connect GitHub"
- Or visit: `https://your-app-url.com/connect/github`

**For Jira:**
- Type: `/cr settings` → Click "Connect Jira"

**For Billing:**
- Type: `/upgrade` command
- Or type: `/billing` command

### Fix 4: Check Button Click Logs

After clicking a button, check your app logs for:
- `GitHub button clicked from Home Tab`
- `Jira button clicked from Home Tab`
- `Billing button clicked from Home Tab`

**If you see these logs:**
- The button click is being received ✅
- Check for errors after these logs
- The handler is trying to process the click

**If you DON'T see these logs:**
- Button click is not reaching your app ❌
- Interactivity is likely not enabled
- Or Request URL is wrong

## Common Issues

### Issue 1: "Missing trigger ID"
**Symptom:** Button click received but modal doesn't open

**Solution:**
- The handler will try to send an ephemeral message instead
- For GitHub: You'll get a link to install the GitHub App
- For Jira/Billing: You'll get instructions to use `/cr settings`

### Issue 2: "Missing team ID"
**Symptom:** Handler can't find workspace

**Solution:**
- Handler will try to get it from `auth.test()`
- Should work automatically in single-workspace mode
- If it fails, use `/cr settings` command instead

### Issue 3: Buttons not clickable at all
**Symptom:** Nothing happens when clicking

**Solution:**
- Interactivity is definitely not enabled
- Enable it in Slack App settings (see Fix 2)
- Reinstall the app after enabling

## Debugging Steps

1. **Click a button** (GitHub, Jira, or Billing)
2. **Check app logs immediately** - Look for:
   - Button click log entry
   - Any error messages
   - Missing fields warnings
3. **Check Slack** - Do you see:
   - An ephemeral message?
   - An error message?
   - Nothing at all?

4. **Based on what you see:**
   - **Nothing in logs** → Interactivity not enabled
   - **Logs but no action** → Check error messages
   - **Ephemeral message** → Handler working, but modal can't open (use alternative method)

## Workaround: Use Commands

While we fix the buttons, you can use:

- **`/cr settings`** - Opens full settings modal with all options
- **`/upgrade`** - Opens upgrade flow
- **`/billing`** - Manages billing

These commands work reliably and give you access to all the same features.

## After Fixing

Once Interactivity is enabled and buttons work:
1. Click **GitHub** → Install GitHub App
2. Click **Jira** → Connect Jira credentials
3. Click **Billing** → Upgrade or manage subscription

The buttons should open modals or redirect you to the appropriate page.

