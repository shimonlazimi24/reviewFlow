# Production Readiness Status

## ✅ Completed

### A) POLAR BILLING – COMPLETE UPGRADE FLOW ✅
1. ✅ Polar webhook endpoint: `POST /webhooks/polar`
   - ✅ Signature verification using HMAC
   - ✅ Handles: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.revoked`
   - ✅ Updates workspace subscription fields in DB
   - ✅ Adds audit logs for subscription changes
   - ✅ Rate limiting (10 req/min)

2. ✅ Usage counter enforcement
   - ✅ `incrementUsage()` called on each PR processed
   - ✅ Monthly reset logic in `loadWorkspaceContext()`
   - ✅ Usage limit checking after increment

3. ⚠️ "Refresh subscription" action - **TODO**: Add button in Settings modal

### B) GITHUB CONNECT – WORKSPACE ↔ INSTALLATION ID LINKING ✅
1. ✅ GitHub installation webhook handler
   - ✅ Handles `installation` and `installation_repositories` events
   - ✅ Updates workspace with `githubInstallationId` and `githubAccount`
   - ✅ Updates workspace settings

2. ✅ Webhook processing resolves workspace reliably
   - ✅ Uses `getWorkspaceByGitHubInstallation()` to find workspace
   - ✅ Returns 403 with helpful message if unknown installation

3. ⚠️ Connect token flow - **TODO**: Implement state token for initial connection

### C) JIRA CONNECT – WORKSPACE SCOPED + SECURE STORAGE ✅
1. ✅ Jira credentials workspace-scoped
   - ✅ `JiraConnection` table keyed by `workspaceId`
   - ✅ API token encrypted using `ENCRYPTION_KEY`

2. ✅ Slack Settings modal flows
   - ✅ "Connect Jira" button exists in onboarding
   - ✅ Modal for entering credentials
   - ✅ Saves encrypted connection

3. ✅ Jira per workspace in PR pipeline
   - ✅ Fetches `JiraConnection` for workspace
   - ✅ Respects plan feature gate

### D) WORKSPACE SETTINGS – DEFAULT CHANNEL + REPO MAPPING ⚠️
1. ✅ Replaced `env.SLACK_DEFAULT_CHANNEL_ID` usage
   - ✅ Uses `workspace.defaultChannelId` and `workspace_settings.defaultChannelId`
   - ✅ Falls back gracefully with admin notification

2. ⚠️ Settings action to set default channel - **TODO**: Add to Settings modal

3. ⚠️ Repo mapping UI - **TODO**: Add to Settings modal

4. ✅ Validation for unmapped repos
   - ✅ Posts ephemeral message to admin if no channel configured
   - ✅ Returns 200 with message (doesn't fail silently)

### E) PRODUCT HARDENING ✅
1. ✅ GitHub webhook signature validation
   - ✅ Enabled in production (requires `GITHUB_WEBHOOK_SECRET`)
   - ✅ Uses raw body capture middleware

2. ✅ Rate limiting
   - ✅ Applied to webhook endpoints (GitHub: 100/min, Polar: 10/min)

3. ⚠️ Structured logging - **TODO**: Add workspaceId, installationId, repo, pr number to all logs

4. ✅ Error handling
   - ✅ Webhook handlers wrapped in try-catch
   - ✅ Returns actionable errors

5. ✅ Database parity
   - ✅ All tables created in PostgreSQL
   - ✅ All methods exist in both MemoryDb and PostgresDb

### F) SLACK MARKETPLACE READINESS ⚠️
1. ⚠️ App Home "Getting Started" checklist - **TODO**: Enhance onboarding checklist
2. ⚠️ "Contact support" link - **TODO**: Add to Home Tab

---

## 🔄 Remaining Tasks

1. **Add "Refresh subscription" button** in Settings modal
2. **Add default channel selector** in Settings modal
3. **Add repo mapping UI** in Settings modal
4. **Enhance structured logging** with workspaceId, installationId, etc.
5. **Enhance Getting Started checklist** in App Home
6. **Add support links** to Home Tab

---

## Next Steps

Continue implementing the remaining UI features and logging enhancements.

