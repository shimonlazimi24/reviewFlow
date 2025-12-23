# How Slack Apps Handle Billing - Industry Standards & ReviewFlow

## 📊 Common Billing Models for Slack Apps

### 1. **Per-Workspace Subscription** (Most Common) ⭐

**How it works:**
- Each Slack workspace pays separately
- One subscription per workspace (not per user)
- Monthly or annual billing
- **This is what ReviewFlow uses**

**Examples:**
- **Slack Apps:** Asana, Trello, Google Drive, Zoom
- **Pricing:** Usually $5-50/month per workspace
- **Best for:** Apps that provide value to the entire team

**ReviewFlow Implementation:**
- ✅ Uses Polar.sh for payment processing
- ✅ One subscription per Slack workspace
- ✅ Billing tied to `slackTeamId`
- ✅ Free tier + Pro tier model

---

### 2. **Freemium Model** (Very Popular)

**How it works:**
- Free tier with limited features
- Paid tier unlocks full features
- Upgrade prompts when limits are reached

**Examples:**
- **Slack Apps:** Zapier (free: 5 tasks, paid: unlimited), Notion (free: limited blocks)
- **Pricing:** Free + $10-100/month for Pro
- **Best for:** Apps that want to grow user base quickly

**ReviewFlow Implementation:**
- ✅ **Free Plan:**
  - 1 team
  - 5 members
  - 3 repositories
  - 50 PRs/month
  - Basic features only
- ✅ **Pro Plan:**
  - Unlimited teams, members, repos
  - 500 PRs/month
  - Jira Integration
  - Auto Balance
  - Reminders
  - Advanced Analytics

---

### 3. **Per-User Pricing** (Less Common)

**How it works:**
- Charge per active user in the workspace
- More users = higher cost
- Usually $2-10 per user/month

**Examples:**
- **Slack Apps:** Some enterprise apps (Salesforce, Microsoft Teams)
- **Best for:** Apps where each user gets individual value

**ReviewFlow:** ❌ Not implemented (uses per-workspace instead)

---

### 4. **Usage-Based Pricing** (Emerging)

**How it works:**
- Charge based on actual usage
- Pay per action/event
- Good for variable workloads

**Examples:**
- **Slack Apps:** Some API-heavy apps
- **Pricing:** $0.01-0.10 per action
- **Best for:** Apps with highly variable usage

**ReviewFlow:** ⚠️ Partially implemented (monthly PR limits, but not pay-per-PR)

---

### 5. **One-Time Payment** (Rare)

**How it works:**
- Single payment for lifetime access
- Less common for SaaS apps
- Usually for simple utilities

**ReviewFlow:** ❌ Not implemented

---

## 🎯 ReviewFlow's Billing Model

### Current Implementation

**Model:** Per-Workspace Subscription + Freemium

**How it works:**
1. **Free Tier** (Default)
   - Every workspace starts free
   - Limited features and usage
   - No payment required

2. **Upgrade Flow**
   - Admin clicks "Upgrade to Pro" button
   - Redirected to Polar.sh checkout page
   - Enters payment info
   - Subscription created

3. **Billing Management**
   - Each workspace has its own subscription
   - Billing tied to `slackTeamId`
   - Webhook updates subscription status automatically

4. **Payment Processing**
   - Uses **Polar.sh** (external payment processor)
   - Supports credit cards, PayPal, etc.
   - Handles recurring billing automatically

---

## 💳 How ReviewFlow Charges (Technical Details)

### Step 1: User Initiates Upgrade

**From Home Tab:**
- Admin clicks "💳 Billing" button
- Or types `/upgrade` command
- Or uses `/cr settings` → Billing section

### Step 2: Checkout Session Created

```typescript
// Creates checkout link with workspace metadata
const checkout = await polar.createCheckoutSession({
  slackTeamId: "T01234567",  // Slack workspace ID
  slackUserId: "U01234567",  // Admin user ID
  plan: "pro"
});
```

**What happens:**
- Polar.sh generates secure checkout URL
- Metadata includes `slackTeamId` for workspace identification
- User redirected to Polar checkout page

### Step 3: Payment Processing

**On Polar.sh:**
- User enters payment details
- Payment processed securely
- Subscription created in Polar

### Step 4: Webhook Updates ReviewFlow

**Polar sends webhook:**
```
POST /webhooks/polar
{
  "type": "subscription.created",
  "data": {
    "subscription": {
      "id": "sub_xxx",
      "customer_id": "cus_xxx",
      "status": "active",
      "metadata": {
        "slack_team_id": "T01234567"
      }
    }
  }
}
```

**ReviewFlow updates:**
- Sets `workspace.plan = 'pro'`
- Sets `workspace.subscriptionStatus = 'active'`
- Stores `polarCustomerId` and `polarSubscriptionId`
- Unlocks Pro features immediately

### Step 5: Ongoing Billing

**Recurring Payments:**
- Polar automatically charges monthly/yearly
- Sends `subscription.updated` webhook on renewal
- ReviewFlow updates `currentPeriodEnd` date

**Cancellation:**
- User clicks "Manage Billing" → Customer Portal
- Cancels subscription in Polar
- Polar sends `subscription.canceled` webhook
- ReviewFlow downgrades to Free (access until period end)

---

## 🔄 Comparison: ReviewFlow vs Industry Standards

| Feature | Industry Standard | ReviewFlow | Status |
|---------|------------------|------------|--------|
| **Billing Model** | Per-workspace subscription | ✅ Per-workspace | ✅ Matches |
| **Freemium** | Very common | ✅ Free + Pro | ✅ Matches |
| **Payment Processor** | Stripe (most common) | Polar.sh | ⚠️ Different (but similar) |
| **Checkout Flow** | Web-based redirect | ✅ Web-based redirect | ✅ Matches |
| **Customer Portal** | Standard | ✅ Customer Portal | ✅ Matches |
| **Webhook Updates** | Standard | ✅ Webhook updates | ✅ Matches |
| **Per-User Pricing** | Some apps | ❌ Not implemented | ⚠️ Different (by design) |
| **Usage-Based** | Emerging | ⚠️ Partial (limits, not pay-per-use) | ⚠️ Different |

---

## 💡 Why ReviewFlow Uses Per-Workspace Billing

### Advantages:
1. ✅ **Simple for customers** - One price, no per-user math
2. ✅ **Predictable costs** - Fixed monthly fee
3. ✅ **Easy to understand** - "Pro plan = $X/month"
4. ✅ **Good for team tools** - Value is shared across team
5. ✅ **Lower friction** - No need to count users

### Disadvantages:
1. ⚠️ **May be expensive for small teams** - Same price for 5 vs 50 users
2. ⚠️ **Less scalable revenue** - Can't charge more for larger teams
3. ⚠️ **Harder to justify for single users** - Designed for teams

---

## 🚀 Alternative Billing Models (Future Considerations)

### Option 1: Per-User Pricing
```typescript
// Could implement:
const pricePerUser = 5; // $5/user/month
const activeUsers = await countActiveUsers(workspaceId);
const monthlyPrice = activeUsers * pricePerUser;
```

**Pros:**
- Scales with team size
- Fair for small teams
- More revenue potential

**Cons:**
- More complex to implement
- Harder to predict costs
- May discourage adding users

### Option 2: Usage-Based (Pay-Per-PR)
```typescript
// Could implement:
const pricePerPR = 0.10; // $0.10 per PR processed
const prsThisMonth = await countPRsProcessed(workspaceId, thisMonth);
const monthlyPrice = prsThisMonth * pricePerPR;
```

**Pros:**
- Pay only for what you use
- Fair for low-usage teams
- Scales automatically

**Cons:**
- Unpredictable costs
- Complex billing logic
- May discourage usage

### Option 3: Tiered Per-Workspace
```typescript
// Current model but with more tiers:
FREE: $0/month (current limits)
STARTER: $10/month (10 members, 10 repos)
PRO: $50/month (unlimited)
ENTERPRISE: $200/month (custom features)
```

**Pros:**
- More options for different team sizes
- Better fit for various use cases
- Can capture more revenue

**Cons:**
- More complex to manage
- Harder to choose the right tier
- More support needed

---

## 📋 Current ReviewFlow Billing Flow

### For Admins:

1. **See Current Plan**
   - Home Tab → Shows plan status
   - `/cr settings` → Billing section
   - `/billing` command

2. **Upgrade to Pro**
   - Click "💳 Billing" button in Home Tab
   - Or `/upgrade` command
   - Redirected to Polar checkout
   - Enter payment info
   - Subscription activated immediately

3. **Manage Subscription**
   - Click "💳 Billing" → "Manage Billing"
   - Opens Polar Customer Portal
   - Update payment method
   - View invoices
   - Cancel subscription

4. **Automatic Renewal**
   - Polar charges automatically
   - ReviewFlow updates via webhook
   - No action needed

### For Non-Admins:

- Cannot access billing
- See current plan status
- Cannot upgrade (admin-only)

---

## 🎯 Best Practices ReviewFlow Follows

1. ✅ **Clear Pricing** - Free vs Pro clearly defined
2. ✅ **Easy Upgrade** - One-click upgrade flow
3. ✅ **Transparent Billing** - Shows plan, usage, renewal date
4. ✅ **Graceful Downgrade** - Access until period end after cancel
5. ✅ **Feature Gating** - Pro features clearly marked
6. ✅ **Usage Limits** - Free tier has clear limits
7. ✅ **Admin-Only** - Only admins can manage billing
8. ✅ **Webhook Updates** - Automatic subscription sync

---

## 🔮 Future Enhancements (Optional)

### Could Add:
- **Annual billing discount** (e.g., 20% off)
- **Team tier** (between Free and Pro)
- **Enterprise tier** (custom pricing)
- **Trial period** (14-day free Pro trial)
- **Usage alerts** (warn when approaching limits)
- **Invoice history** (view past invoices in Slack)
- **Payment method management** (update card in Slack)

---

## 📚 Resources

- **Polar.sh Docs:** https://docs.polar.sh
- **Slack App Billing Best Practices:** https://api.slack.com/best-practices
- **ReviewFlow Billing Setup:** See `POLAR_SETUP.md`

---

## Summary

**ReviewFlow uses the industry-standard per-workspace subscription model with freemium:**

- ✅ **One subscription per Slack workspace**
- ✅ **Free tier + Pro tier**
- ✅ **External payment processor (Polar.sh)**
- ✅ **Webhook-based subscription sync**
- ✅ **Admin-only billing management**

This matches how most successful Slack apps handle billing (Asana, Trello, Zapier, etc.).

