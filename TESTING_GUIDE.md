# Testing ReviewFlow with GitHub PRs

This guide will help you test ReviewFlow by creating a PR and seeing it automatically assign reviewers.

## Prerequisites Checklist

Before testing, ensure you have:

- [x] ✅ **Notification Channel** configured (e.g., `#all-reviewflow`)
- [x] ✅ **GitHub Connected** (Installation ID: `100951978`)
- [ ] ⏳ **Team Created** (use `/create-team`)
- [ ] ⏳ **Team Members Added** (use `/cr add-reviewer`)
- [ ] ⏳ **Repository Mapped** (use `/map-repo`)
- [ ] ⏳ **Go Live Enabled** (click "🚀 Go Live" button in Home Tab)

## Step-by-Step Setup

### 1. Create a Team

In Slack, run:
```
/create-team MyTeam #all-reviewflow
```

This creates a team and sets its notification channel. Note the team ID that's returned (e.g., `team_1234567890`).

### 2. Add Team Members

Add reviewers to your team. Each member needs:
- Slack username
- GitHub username(s)

Example:
```
/cr add-reviewer @john github:johndoe
/cr add-reviewer @jane github:janedoe github:jane-smith
```

**Important:** Make sure the GitHub usernames match the actual GitHub accounts that will be reviewing PRs.

### 3. Map Your Repository

Map your GitHub repository to the team you created:
```
/map-repo owner/repo-name team_1234567890
```

Replace:
- `owner/repo-name` with your actual repository (e.g., `shimonlazimi24/reviewFlow`)
- `team_1234567890` with the team ID from step 1

### 4. Enable Go Live

1. Go to ReviewFlow Home Tab in Slack
2. Click the **"🚀 Go Live"** button
3. If there are missing requirements, fix them and try again
4. Once enabled, the status will show "✅ Live"

## Testing a PR

### Create a Test PR

1. **Create a branch:**
   ```bash
   git checkout -b test-reviewflow-pr
   ```

2. **Make a small change:**
   ```bash
   echo "# Test PR" >> test.md
   git add test.md
   git commit -m "Test: ReviewFlow PR assignment"
   git push origin test-reviewflow-pr
   ```

3. **Open a PR on GitHub:**
   - Go to your repository on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Add a title and description
   - Click "Create Pull Request"

### What Should Happen

1. **GitHub sends webhook** to ReviewFlow
2. **ReviewFlow processes the PR:**
   - Fetches PR commits and files
   - Infers stack (FE/BE/MIXED) from labels or file paths
   - Excludes PR author and commit authors from reviewers
   - Selects reviewers based on stack, workload, and team
3. **Slack notification posted** to your configured channel
4. **Reviewers assigned** and notified

### Check Your Slack Channel

You should see a message like:
```
🔀 Pull Request #123: Test PR
Author: @username
Stack: FE
Reviewers: @reviewer1, @reviewer2
[View PR] [Reassign]
```

## Troubleshooting

### PR Not Appearing in Slack?

1. **Check Go Live status:**
   - Home Tab should show "✅ Live"
   - If "⏸️ Paused", click "🚀 Go Live"

2. **Check repository mapping:**
   - Run `/list-repos` to see mapped repositories
   - Ensure your repo is mapped to a team

3. **Check GitHub webhook:**
   - Go to your GitHub repository → Settings → Webhooks
   - Verify webhook URL: `https://reviewflow-production.up.railway.app/webhooks/github`
   - Check recent deliveries for errors

4. **Check app logs:**
   - Look for webhook delivery logs
   - Check for errors like "Unknown installation" or "Workspace not found"

### No Reviewers Assigned?

1. **Check team members:**
   - Run `/cr list-reviewers` to see configured members
   - Ensure members have correct GitHub usernames
   - Ensure members are in the team mapped to your repo

2. **Check stack inference:**
   - Add labels to your PR (e.g., `frontend`, `backend`)
   - Or ensure file paths match your stack rules

3. **Check exclusion:**
   - PR author is automatically excluded
   - Commit authors are also excluded
   - Make sure you have other team members available

### Webhook Not Received?

1. **Verify GitHub App installation:**
   - Go to https://github.com/settings/installations
   - Ensure ReviewFlow app is installed
   - Check that your repository is selected

2. **Check webhook URL in GitHub App:**
   - Go to your GitHub App settings
   - Verify webhook URL is set correctly
   - Ensure webhook events include `pull_request`

## Quick Commands Reference

```bash
# Team Management
/create-team <name> <channel-id>     # Create a team
/list-teams                          # List all teams

# Member Management
/cr add-reviewer @user github:ghuser # Add reviewer
/cr list-reviewers                   # List reviewers
/cr remove-reviewer @user            # Remove reviewer

# Repository Mapping
/map-repo owner/repo team-id         # Map repo to team
/list-repos                          # List mapped repos
/unmap-repo owner/repo               # Remove mapping

# Status
/cr status                            # Check setup status
```

## Next Steps

Once everything is working:
- ✅ Test with different PR types (FE, BE, MIXED)
- ✅ Test with multiple commit authors
- ✅ Test reassignment feature
- ✅ Test reminders (if configured)
- ✅ Test Jira integration (if Pro plan)

Happy testing! 🚀

