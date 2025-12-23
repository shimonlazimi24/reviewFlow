# ReviewFlow Onboarding Setup Guide

## Overview

ReviewFlow includes an **in-Slack onboarding flow** that guides **ALL teams** (free and paid) through the minimal setup steps required to start using the plugin. The onboarding checklist appears in the Slack Home Tab when setup is incomplete, regardless of subscription plan.

## What Was Implemented

### 1. Onboarding Checklist (Home Tab)
- Automatically appears when:
  - GitHub is not connected, OR
  - No team members are added
- Shows 3-step setup guide:
  1. **Connect GitHub** - Required
  2. **Connect Jira** - Optional (for Pro plans)
  3. **Add Team Members** - Required

### 2. GitHub Connection Flow
- **Button**: "🔗 Connect GitHub" in Home Tab
- **Action**: Opens a modal with instructions and a button to install the GitHub App
- **Installation**: Redirects to GitHub App installation page
- **Callback**: Automatically saves `github_installation_id` to workspace when installation completes

### 3. Jira Connection Flow
- **Button**: "🔗 Connect Jira" in Home Tab
- **Action**: Opens a modal with form fields:
  - Jira Base URL (e.g., `https://company.atlassian.net`)
  - Jira Email
  - Jira API Token
- **Security**: API token is encrypted before storing in database
- **Validation**: Checks all fields are filled before saving

### 4. Team Member Import Flow
- **Button**: "👥 Import Members" in Home Tab
- **Action**: Opens a modal for bulk member import
- **Format**: One member per line:
  ```
  @slack-user github-username FE|BE|FS
  ```
- **Example**:
  ```
  @alice alice-dev FE
  @bob bob-coder BE
  @charlie charlie-fullstack FS
  ```
- **Validation**: 
  - Checks format is correct
  - Skips duplicate members (by Slack user ID or GitHub username)
  - Only accepts roles: `FE`, `BE`, `FS`

## How It Works

### For All Teams (Free & Paid)

1. **Install ReviewFlow** in your Slack workspace (works for free and paid plans)
2. **Open Home Tab** - You'll see the onboarding checklist if setup is incomplete
3. **Complete the steps**:
   - **Step 1: Connect GitHub** (Required) → Install GitHub App → Select repositories
   - **Step 2: Connect Jira** (Optional, Pro plan required for use) → Enter credentials
     - Free users can connect Jira now, but it will only work after upgrading to Pro
   - **Step 3: Add Team Members** (Required) → Import members
4. **Setup Complete!** - The checklist disappears and ReviewFlow is ready

### Important Notes

- **Onboarding is available to ALL users** - Free plan users can complete all setup steps
- **Jira Integration** requires a Pro plan, but free users can connect their Jira credentials now
  - The connection will be saved and activated automatically when they upgrade
- **GitHub and Members** are required for all plans to use ReviewFlow
- The checklist appears automatically when setup is incomplete, regardless of plan

## Technical Details

### Files Modified/Created

1. **`src/slack/onboarding.ts`** (NEW)
   - `buildOnboardingChecklist()` - Creates the checklist UI
   - `buildGitHubConnectModal()` - GitHub connection modal
   - `buildJiraConnectModal()` - Jira connection modal
   - `buildBulkMemberImportModal()` - Member import modal
   - `registerOnboardingHandlers()` - Registers all action handlers

2. **`src/slack/homeTab.ts`** (MODIFIED)
   - Integrated onboarding checklist into Home Tab
   - Shows checklist when setup is incomplete

3. **`src/routes/githubConnect.ts`** (EXISTING)
   - Handles GitHub App installation callback
   - Saves `github_installation_id` to workspace

4. **`src/index.ts`** (MODIFIED)
   - Registers onboarding handlers on app startup

### Database Changes

- **Workspace** table stores:
  - `github_installation_id` - GitHub App installation ID
  - `default_channel_id` - Default Slack channel for notifications

- **Jira Connections** table stores (per workspace):
  - `base_url` - Jira instance URL
  - `email` - Jira user email
  - `api_token` - Encrypted API token

- **Members** table stores (per workspace):
  - `slack_user_id` - Slack user ID
  - `github_usernames` - Array of GitHub usernames
  - `roles` - Array of roles (FE, BE, FS)

## Environment Variables

### Required for GitHub Connection
- `GITHUB_APP_ID` (optional) - Your GitHub App ID
- `GITHUB_APP_NAME` (optional, default: 'reviewflow') - Your GitHub App name
- `APP_BASE_URL` - Your app's base URL (e.g., `https://reviewflow.yourdomain.com`)

### Required for Jira Connection
- `ENCRYPTION_KEY` - 64-character hex string (32 bytes) for encrypting Jira tokens
  - Generate with: `openssl rand -hex 32`

## Next Steps for Deployment

1. **Set up GitHub App** (if not already done):
   - Create a GitHub App at https://github.com/settings/apps
   - Set webhook URL: `https://yourdomain.com/webhooks/github`
   - Set callback URL: `https://yourdomain.com/connect/github/callback`
   - Note your App ID and App name

2. **Set environment variables**:
   ```bash
   GITHUB_APP_ID=your_app_id
   GITHUB_APP_NAME=your_app_name
   APP_BASE_URL=https://yourdomain.com
   ENCRYPTION_KEY=$(openssl rand -hex 32)
   ```

3. **Deploy and test**:
   - Deploy to your hosting platform (Railway, Render, etc.)
   - Install ReviewFlow in a test Slack workspace
   - Open Home Tab and verify onboarding checklist appears
   - Complete each step and verify it works

## Testing Locally

1. **Start ngrok**:
   ```bash
   ngrok http 3000
   ```

2. **Update environment variables**:
   ```bash
   APP_BASE_URL=https://your-ngrok-url.ngrok.io
   ```

3. **Update GitHub App settings**:
   - Webhook URL: `https://your-ngrok-url.ngrok.io/webhooks/github`
   - Callback URL: `https://your-ngrok-url.ngrok.io/connect/github/callback`

4. **Start the app**:
   ```bash
   npm run dev
   ```

5. **Test in Slack**:
   - Open Home Tab
   - Click onboarding buttons
   - Complete setup steps

## Troubleshooting

### Checklist doesn't appear
- Check that `workspace.githubInstallationId` is null/undefined
- Check that `db.listMembers(workspaceId)` returns empty array
- Verify Home Tab is refreshing after changes

### GitHub connection fails
- Verify `GITHUB_APP_ID` and `GITHUB_APP_NAME` are set correctly
- Check GitHub App callback URL matches your `APP_BASE_URL`
- Verify GitHub App has required permissions

### Jira connection fails
- Verify `ENCRYPTION_KEY` is set (64-character hex string)
- Check Jira credentials are correct
- Verify Jira user has permission to create issues

### Member import fails
- Check format: `@slack-user github-username FE|BE|FS`
- Verify Slack user IDs are correct (use `@username` format)
- Check GitHub usernames are valid
- Verify roles are exactly: `FE`, `BE`, or `FS`

## Future Enhancements

- [ ] Import members directly from Slack workspace (no manual entry)
- [ ] GitHub App installation flow with OAuth state verification
- [ ] Jira connection test before saving
- [ ] Team creation during onboarding
- [ ] Repo mapping during onboarding
- [ ] Progress indicator (e.g., "2 of 3 steps complete")

