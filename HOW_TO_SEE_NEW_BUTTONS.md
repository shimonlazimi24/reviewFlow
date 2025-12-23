# How to See the New Buttons in Home Tab

## Steps to See the New Buttons

### 1. Wait for App to Redeploy
- Your app should automatically redeploy after the git push
- Wait **1-2 minutes** for deployment to complete
- Check your deployment logs to confirm it's done

### 2. Refresh the Home Tab
The Home Tab updates automatically when you open it, but you may need to refresh:

**Option A: Close and Reopen**
1. Close the ReviewFlow app (click X or navigate away)
2. Click on **ReviewFlow** in your Apps list again
3. Click the **"Home"** tab
4. The new buttons should appear!

**Option B: Force Refresh**
1. In the Home Tab, scroll to the bottom
2. The buttons should be there:
   - **🐙 GitHub** button
   - **🎫 Jira** button  
   - **💳 Billing** button
   - **⚙️ Full Settings** button

### 3. What You Should See

In the **"⚙️ ReviewFlow Configuration"** section, you should see:

1. **Current Configuration** (existing)
   - Notification Channel
   - Required Reviewers
   - Reminder Hours
   - Status

2. **Stack Labels** (existing)
   - FE Labels
   - BE Labels

3. **🔗 Integrations** (NEW!)
   - GitHub: ✅ Connected / ❌ Not connected
   - Jira: ✅ Connected / ❌ Not connected
   - **Buttons:** GitHub | Jira | Billing

4. **Action Buttons** (updated)
   - ✏️ Edit Settings
   - 📤 Send Test Message
   - **⚙️ Full Settings** (NEW!)

## If You Still Don't See the Buttons

### Check 1: Is Your App Deployed?
- Check your deployment platform (Railway/Render) logs
- Make sure the latest commit is deployed
- Look for: `Simple home tab published` in logs

### Check 2: Is Your Workspace Configured?
- The new buttons only appear if your workspace is configured
- If you see "Start Setup" instead, complete the basic setup first
- Then the buttons will appear

### Check 3: Try Manual Refresh
1. Type `/cr settings` in any channel
2. This opens the full settings modal (alternative way to access everything)
3. The Home Tab buttons are just shortcuts to the same features

### Check 4: Check App Logs
When you open the Home Tab, check your app logs for:
```
[INFO] Simple home tab published { userId: "...", teamId: "...", configured: true }
```

If you see this, the Home Tab is being published. If the buttons still don't appear, there might be a rendering issue.

## Alternative: Use `/cr settings` Command

If the buttons don't appear, you can always use:
- **Type:** `/cr settings` in any Slack channel
- This opens the **complete settings modal** with all options:
  - GitHub connection
  - Jira connection
  - Teams & Members
  - Repository Mapping
  - **Billing & Plan**

## Quick Test

1. Open ReviewFlow → **Home** tab
2. Scroll down
3. You should see a section called **"🔗 Integrations"**
4. Below that, buttons: **GitHub** | **Jira** | **Billing**
5. At the very bottom: **Edit Settings** | **Send Test Message** | **Full Settings**

If you see this, the buttons are working! 🎉

