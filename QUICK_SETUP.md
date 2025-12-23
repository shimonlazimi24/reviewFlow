# Quick Setup to Test PR Assignment

## Step 1: Verify GitHub Connection

The Home Tab shows "GitHub: Not connected" but you said you connected it. Let's verify:

1. **Click the "🔄 Refresh" button** in the Home Tab
2. If it still shows "Not connected", try:
   - Click the "GitHub" button again
   - The installation ID should be `100951978`
   - If the modal opens, just close it (connection should already be saved)

## Step 2: Create a Team

In Slack, run:
```
/create-team MyTeam #all-reviewflow
```

**Copy the team ID** that's returned (e.g., `team_1234567890`)

## Step 3: Add Yourself as a Reviewer

Replace `@your-username` and `github:your-github-username` with your actual usernames:

```
/cr add-reviewer @your-slack-username github:your-github-username
```

Example:
```
/cr add-reviewer @shimon github:shimonlazimi24
```

## Step 4: Map Your Repository

Use the team ID from Step 2:

```
/map-repo shimonlazimi24/reviewFlow team_1234567890
```

Replace `team_1234567890` with your actual team ID.

## Step 5: Enable Go Live

1. Go to ReviewFlow Home Tab
2. Click **"🚀 Go Live"** button
3. If it shows errors, fix them and try again
4. Status should change to "✅ Live"

## Step 6: Create the PR

The test branch is already created and pushed! Just:

1. **Open this link:**
   https://github.com/shimonlazimi24/reviewFlow/compare/test-reviewflow-1766526632

2. **Click "Create Pull Request"**

3. **Add title:** `Test: ReviewFlow PR Assignment`

4. **Click "Create Pull Request"**

## What Should Happen

Within a few seconds:
- ✅ ReviewFlow receives the webhook
- ✅ Reviewers are automatically assigned
- ✅ Message appears in `#all-reviewflow` channel
- ✅ You can see who was assigned

## Troubleshooting

If nothing happens:
1. Check Go Live is enabled (Home Tab shows "✅ Live")
2. Check repository is mapped: `/list-repos`
3. Check team members: `/cr list-reviewers`
4. Check GitHub webhook: Go to repo → Settings → Webhooks

