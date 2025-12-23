# Critical Improvements Implementation Plan

## Status: In Progress

### ✅ A) DB Injection - COMPLETED
- Added `setDb()` function for dependency injection
- Updated `src/index.ts` to use `setDb()` instead of direct assignment
- Added startup logging to show which DB adapter is active
- All modules now use the shared DB instance

### 🔄 B) Slack OAuth Multi-Workspace - IN PROGRESS
**Status:** Needs implementation
- Add env vars: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_STATE_SECRET`
- Create `slack_installations` table in Postgres
- Implement `InstallationStore` backed by Postgres
- Configure Bolt OAuth with `installerOptions` and `installationStore`
- Add `/slack/install` and `/slack/oauth_redirect` routes
- Update all Slack API calls to use workspace-specific tokens

### 🔄 C) Workspace-Scoped Configuration - IN PROGRESS
**Status:** Partially implemented (Workspace table exists, needs workspace_settings table)
- Create `workspace_settings` table keyed by `slack_team_id`
- Fields: `default_channel_id`, `github_installation_id`, `jira_base_url`, `jira_email`, `jira_api_token_encrypted`, `required_reviewers`, `reminder_hours`
- Update `loadWorkspaceContext()` to pull from `workspace_settings`
- Update Slack settings modal handlers to read/write `workspace_settings`
- Ensure encryption for Jira secrets

### 🔄 D) GitHub Connect Flow - PARTIALLY DONE
**Status:** Basic flow exists, needs refinement
- ✅ Routes exist: `/connect/github` and `/connect/github/callback`
- ⚠️ Needs: GitHub App ID/Private Key for JWT flow
- ⚠️ Needs: Signed state parameter for security
- ⚠️ Needs: "Test GitHub connection" button in settings

### ✅ E) Polar Upgrade Flow - MOSTLY DONE
**Status:** Implemented, may need refinement
- ✅ Webhook handler exists
- ✅ Signature verification
- ✅ Subscription state updates
- ⚠️ May need: Better Slack confirmation messages

### 🔄 F) Core Product Flows - PARTIALLY DONE
**Status:** Some features exist, needs enhancement
- ✅ `take_review` action exists
- ✅ `reassign` action exists
- ✅ `reminderService` exists as background job
- ⚠️ Needs: Better analytics (avg_review_time, top_waiting_prs)
- ⚠️ Needs: Reminder spam prevention

### 🔄 G) Production Hardening - IN PROGRESS
**Status:** Needs implementation
- ⚠️ Needs: Request logging with correlation IDs
- ⚠️ Needs: Idempotency for webhooks (github_delivery_id tracking)
- ⚠️ Needs: Rate limits for public endpoints
- ⚠️ Needs: `/cr debug` admin command

---

## Implementation Order

1. ✅ A) DB Injection - DONE
2. 🔄 C) Workspace Settings Table - NEXT
3. 🔄 B) Slack OAuth - CRITICAL
4. 🔄 D) GitHub Connect Refinement
5. 🔄 F) Core Flows Enhancement
6. 🔄 G) Production Hardening

