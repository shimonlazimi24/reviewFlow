# Billing Approaches for Slack Apps

## Two Main Approaches

### 1. **Slack App Directory Billing** (Native Slack)
- Apps listed in Slack App Directory can use Slack's built-in billing
- Users subscribe through Slack's marketplace
- Slack handles payments, subscriptions, and billing
- **Pros:**
  - Native integration with Slack
  - Users trust Slack's payment system
  - Automatic subscription management
  - Built-in billing UI in Slack
- **Cons:**
  - Requires app to be in Slack App Directory
  - Less control over pricing/promotions
  - Revenue share with Slack (typically 20-30%)
  - More complex setup process
  - Limited customization

### 2. **External Billing** (Current Approach - Polar/Stripe)
- Apps use external payment providers (Polar, Stripe, etc.)
- Users subscribe through app's own checkout
- App handles all billing logic
- **Pros:**
  - Full control over pricing and billing
  - No revenue share
  - More flexible (custom plans, trials, etc.)
  - Works for apps not in App Directory
  - Better analytics and reporting
- **Cons:**
  - Users leave Slack to subscribe
  - Need to build billing UI
  - More code to maintain
  - Need to handle webhooks, subscriptions, etc.

## Current ReviewFlow Implementation

We use **External Billing (Polar)** because:
1. ✅ More control over pricing and features
2. ✅ No revenue share
3. ✅ Works immediately (no App Directory approval needed)
4. ✅ Flexible subscription management
5. ✅ Better for custom plans (Free, Pro, Enterprise)

## How It Works Now

1. **User clicks "Billing" button in Home Tab**
2. **App checks if Polar is configured:**
   - If not configured → Shows "Billing Not Configured" message
   - If configured → Creates checkout session
3. **User redirected to Polar checkout** (external site)
4. **After payment → Webhook updates workspace**
5. **User returns to Slack** → Plan updated

## Alternative: Slack App Directory Billing

If you want to use Slack's native billing:

### Requirements:
1. **App must be in Slack App Directory**
   - Submit app for review
   - Get approved by Slack
   - Can take weeks/months

2. **Implement Slack Billing API:**
   - Use Slack's `apps.billing` API
   - Handle Slack subscription events
   - Integrate with Slack's billing UI

3. **Revenue Share:**
   - Slack takes 20-30% of revenue
   - You receive net revenue

### Code Changes Needed:
```typescript
// Would need to add Slack billing handlers
app.action('slack_billing_upgrade', async ({ ack, body, client }) => {
  // Use Slack's billing API
  await client.apps.billing.createSubscription({
    team_id: body.team.id,
    plan: 'pro'
  });
});
```

## Recommendation

**Keep External Billing (Polar)** because:
- ✅ Already implemented and working
- ✅ More flexible for future plans
- ✅ No App Directory approval needed
- ✅ Better for custom features
- ✅ Full control over pricing

**Consider Slack Billing if:**
- You want to be in App Directory anyway
- You want native Slack integration
- You're okay with revenue share
- You want simpler user experience (no external redirect)

## Hybrid Approach (Best of Both)

You could support both:
1. **Free tier** → No billing needed
2. **Pro tier** → External billing (Polar) for flexibility
3. **Enterprise** → Custom billing (direct sales)

Or:
1. **Slack App Directory** → Use Slack billing for App Directory users
2. **Direct installs** → Use Polar for direct installations

## Current User Flow

```
Home Tab → "Billing" button
  ↓
Check Polar config
  ↓
Create Polar checkout session
  ↓
Redirect to Polar (external)
  ↓
User completes payment
  ↓
Polar webhook → Update workspace
  ↓
User returns to Slack
  ↓
Plan updated in Home Tab
```

## Slack App Directory Flow (Alternative)

```
Home Tab → "Upgrade" button
  ↓
Open Slack billing modal (native)
  ↓
User subscribes in Slack
  ↓
Slack webhook → Update workspace
  ↓
Plan updated automatically
```

## Decision Matrix

| Feature | External (Polar) | Slack Native |
|---------|------------------|--------------|
| Setup Time | ✅ Fast (hours) | ❌ Slow (weeks) |
| Revenue Share | ✅ 0% | ❌ 20-30% |
| Custom Plans | ✅ Yes | ⚠️ Limited |
| User Experience | ⚠️ External redirect | ✅ Native |
| Control | ✅ Full | ⚠️ Limited |
| App Directory Required | ✅ No | ❌ Yes |

## Conclusion

**For ReviewFlow, external billing (Polar) is the better choice** because:
- You have full control
- No App Directory approval needed
- More flexible for future growth
- Already implemented

The slight inconvenience of external redirect is worth the benefits.

