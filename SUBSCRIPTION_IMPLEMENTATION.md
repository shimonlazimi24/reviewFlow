# Subscription Model Implementation Guide

## ✅ What Was Implemented

### 1. Subscription Types & Plans

**Plans:**
- `FREE` - 1 team, 5 members, 3 repos, 50 PRs/month
- `PRO` - 5 teams, 20 members, 20 repos, 500 PRs/month + Jira, Auto Balance, Reminders
- `TEAM` - 20 teams, 100 members, 100 repos, 2000 PRs/month + API Access, Custom Workflows
- `ENTERPRISE` - Unlimited everything

**Status:**
- `active` - Subscription is active
- `canceled` - Subscription canceled (access until period end)
- `past_due` - Payment failed
- `trialing` - In trial period

### 2. Workspace Context System

Every request loads workspace context which includes:
- Current subscription plan
- Feature limits
- Usage statistics
- GitHub installation ID

**Files:**
- `src/services/workspaceContext.ts` - Loads and manages workspace context
- `src/types/subscription.ts` - Subscription types and plan limits

### 3. Feature Gating

**Middleware:**
- `requireFeature(featureName)` - Blocks access to paid features
- `checkUsageLimit()` - Enforces monthly PR limits

**Protected Features:**
- Jira Integration (PRO+)
- Auto Balance (PRO+)
- Reminders (PRO+)
- Advanced Analytics (PRO+)
- API Access (TEAM+)
- Custom Workflows (TEAM+)

**Files:**
- `src/middleware/featureGate.ts` - Feature gating middleware

### 4. Polar.sh Billing Integration

**Service:**
- `PolarService` - Handles Polar webhook events
- Webhook endpoint: `/webhooks/polar`
- Handles: `subscription.created`, `subscription.updated`, `subscription.canceled`

**Checkout Flow:**
- Generates checkout URLs with workspace metadata
- Syncs subscription status from Polar to workspace

**Files:**
- `src/services/polarService.ts` - Polar.sh integration

### 5. Slack Home Tab

**Features:**
- Shows current plan and status
- Displays usage (PRs processed / limit)
- Lists available features
- Upgrade CTA for free plans
- Shows renewal date for paid plans

**Files:**
- `src/slack/homeTab.ts` - Home tab implementation

### 6. Usage Tracking

**Tracking:**
- PRs processed per workspace per month
- Automatic limit enforcement
- Monthly reset

**Database:**
- `incrementUsage()` - Track PR processing
- `getUsage()` - Get current usage
- `resetUsage()` - Monthly reset

### 7. Audit Logs

**Events Logged:**
- PR opened
- Reviewer assigned
- Reviewer reassigned
- Jira transitioned
- Review completed

**Database:**
- `addAuditLog()` - Add audit entry

### 8. GitHub App Installation Validation

**Validation:**
- Checks installation ID on webhook
- Rejects unknown repositories
- Maps installation to workspace

### 9. Jira Hardening

**Improvements:**
- Rate limit handling with retry
- Graceful degradation (doesn't block flow)
- Error handling with fallbacks

### 10. Production Readiness

**Endpoints:**
- `/health` - Health check
- `/ready` - Readiness check (database connectivity)

**Logging:**
- Structured JSON logging
- Environment validation on boot
- Webhook signature verification

---

## 🔧 Configuration

### Environment Variables

```bash
# Polar.sh Billing
POLAR_BASE_URL=https://polar.sh
POLAR_API_KEY=your-api-key
POLAR_WEBHOOK_SECRET=your-webhook-secret
POLAR_PRODUCT_ID_PRO=prod_xxx
POLAR_PRODUCT_ID_TEAM=prod_xxx
POLAR_PRODUCT_ID_ENTERPRISE=prod_xxx
```

### Slack App Configuration

**Required Scopes:**
- `app_mentions:read`
- `channels:history`
- `channels:read`
- `chat:write`
- `chat:write.public`
- `commands`
- `im:history`
- `im:read`
- `im:write`
- `users:read`
- `users:read.email`

**Home Tab:**
- Enable in Slack App settings
- Event: `app_home_opened`

---

## 📋 Setup Steps

### 1. Create Polar.sh Products

1. Go to [Polar.sh Dashboard](https://polar.sh)
2. Create products for each plan:
   - PRO plan product
   - TEAM plan product
   - ENTERPRISE plan product
3. Copy product IDs to environment variables

### 2. Configure Polar Webhook

1. In Polar.sh, go to Settings → Webhooks
2. Add webhook URL: `https://your-app.railway.app/webhooks/polar`
3. Select events:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
4. Copy webhook secret to `POLAR_WEBHOOK_SECRET`

### 3. Enable Slack Home Tab

1. Go to Slack App settings
2. Navigate to "App Home"
3. Enable "Home Tab"
4. Save changes

### 4. Test Subscription Flow

1. **Create subscription:**
   - User clicks "Upgrade to Pro" in Home Tab
   - Redirects to Polar checkout
   - Completes payment

2. **Webhook received:**
   - Polar sends `subscription.created` webhook
   - System updates workspace subscription
   - Features unlocked

3. **Verify:**
   - Check `/reviewflow` command
   - Should show PRO plan
   - Jira integration should work

---

## 🎯 Usage Examples

### Check Status
```
/reviewflow
```
Shows current plan, usage, and features.

### Upgrade Flow
1. User opens Home Tab
2. Sees "Upgrade to Pro" button
3. Clicks button → Redirects to Polar
4. Completes checkout
5. Webhook updates subscription
6. Features unlocked immediately

### Feature Gating
When user tries Jira integration on FREE plan:
```
❌ Feature Not Available

Jira Integration requires a PRO plan or higher.

Current Plan: FREE

[🚀 Upgrade to Pro] button
```

### Usage Limits
When FREE plan reaches 50 PRs:
```
❌ Usage limit exceeded

You've reached your monthly limit of 50 PRs.
Upgrade to continue.

[🚀 Upgrade to Pro] button
```

---

## 🔍 Database Schema (PostgreSQL)

To add to PostgreSQL (when migrating):

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(255) PRIMARY KEY,
  slack_team_id VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  github_installation_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  workspace_id VARCHAR(255) PRIMARY KEY REFERENCES workspaces(id),
  plan VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  polar_subscription_id VARCHAR(255),
  current_period_start BIGINT,
  current_period_end BIGINT,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage (
  workspace_id VARCHAR(255) NOT NULL,
  month VARCHAR(7) NOT NULL, -- Format: "2024-01"
  prs_processed INTEGER NOT NULL DEFAULT 0,
  limit INTEGER NOT NULL,
  reset_at BIGINT NOT NULL,
  PRIMARY KEY (workspace_id, month)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(255) PRIMARY KEY,
  workspace_id VARCHAR(255) NOT NULL,
  event VARCHAR(50) NOT NULL,
  metadata JSONB,
  timestamp BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace ON audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
```

---

## 🚀 Next Steps

1. **Add PostgreSQL schema** for workspaces, subscriptions, usage, audit_logs
2. **Implement Polar webhook signature validation**
3. **Add GitHub App installation flow**
4. **Create upgrade modals** for better UX
5. **Add usage analytics dashboard**

---

## 📝 Notes

- All workspaces start as FREE by default
- Usage resets monthly automatically
- Features are gated at middleware level
- Audit logs track all important events
- Jira integration gracefully degrades on errors

