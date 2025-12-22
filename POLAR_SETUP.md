# Polar.sh Billing Setup Guide

This guide walks you through setting up Polar.sh billing integration for ReviewFlow.

## Prerequisites

- Polar.sh account (sign up at https://polar.sh)
- ReviewFlow deployed and accessible via HTTPS
- Admin access to your Slack workspace

---

## Step 1: Create Product in Polar.sh

1. Go to [Polar.sh Dashboard](https://polar.sh/dashboard)
2. Navigate to **Products** → **Create Product**
3. Fill in:
   - **Name**: ReviewFlow Pro
   - **Description**: Pro plan for ReviewFlow
   - **Price**: Set your monthly/yearly price
   - **Billing Period**: Monthly or Yearly
4. Click **Create Product**
5. Copy the **Product ID** (starts with `prod_`)

### Optional: Create Price

If you want to use price IDs instead of product IDs:
1. Go to your product
2. Click **Add Price**
3. Set price and billing period
4. Copy the **Price ID** (starts with `price_`)

---

## Step 2: Get API Credentials

1. Go to [Polar.sh Settings](https://polar.sh/dashboard/settings)
2. Navigate to **API Keys**
3. Click **Create API Key**
4. Copy the **Access Token** (starts with `polar_`)
5. Keep this secret! Store it in your environment variables

---

## Step 3: Configure Webhook

1. Go to [Polar.sh Settings](https://polar.sh/dashboard/settings)
2. Navigate to **Webhooks**
3. Click **Add Webhook**
4. Set:
   - **URL**: `https://your-app.railway.app/webhooks/polar`
   - **Secret**: Generate a random secret (save this!)
5. Select these events:
   - ✅ `subscription.created`
   - ✅ `subscription.updated`
   - ✅ `subscription.canceled`
   - ✅ `subscription.revoked`
   - ✅ `order.created` (optional, for tracking renewals)
6. Click **Create Webhook**

---

## Step 4: Configure Environment Variables

Add these to your `.env` file or deployment platform:

```bash
# Polar.sh Billing
POLAR_BASE_URL=https://api.polar.sh
POLAR_ACCESS_TOKEN=polar_xxx  # From Step 2
POLAR_WEBHOOK_SECRET=your-webhook-secret  # From Step 3
POLAR_PRO_PRODUCT_ID=prod_xxx  # From Step 1
POLAR_PRO_PRICE_ID=price_xxx  # Optional, if using price IDs
APP_BASE_URL=https://your-app.railway.app
```

**Note**: You can use either `POLAR_PRO_PRODUCT_ID` or `POLAR_PRO_PRICE_ID`, but at least one is required.

---

## Step 5: Test Locally with ngrok

1. **Start ngrok:**
   ```bash
   ngrok http 3000
   ```

2. **Update Polar webhook URL:**
   - Use the ngrok URL: `https://your-ngrok-id.ngrok.io/webhooks/polar`
   - Update in Polar.sh dashboard

3. **Update APP_BASE_URL:**
   ```bash
   APP_BASE_URL=https://your-ngrok-id.ngrok.io
   ```

4. **Test upgrade flow:**
   - Run `/upgrade` in Slack
   - Complete checkout in Polar
   - Verify webhook is received
   - Check workspace subscription is updated

---

## Step 6: Verify Integration

1. **Test upgrade command:**
   ```
   /upgrade
   ```
   Should show "Upgrade to Pro" button with checkout link.

2. **Complete test purchase:**
   - Click upgrade button
   - Complete checkout in Polar
   - Return to Slack

3. **Verify subscription:**
   ```
   /billing
   ```
   Should show "Current Plan: PRO" with manage subscription link.

4. **Check webhook logs:**
   - Check your app logs for webhook events
   - Verify workspace is updated in database

---

## Webhook Events

### subscription.created
Triggered when a new subscription is created.

**Action**: Set workspace plan to `pro`, status to `active`.

### subscription.updated
Triggered when subscription is updated (plan change, renewal, etc.).

**Action**: Update workspace plan and status.

### subscription.canceled
Triggered when subscription is canceled.

**Action**: Set status to `canceled` (plan remains until period end).

### subscription.revoked
Triggered when subscription is revoked (payment failed, etc.).

**Action**: Set plan to `free`, status to `revoked`.

---

## Troubleshooting

### Webhook Not Received

1. **Check webhook URL:**
   - Must be HTTPS
   - Must be publicly accessible
   - Check Polar webhook logs

2. **Check signature verification:**
   - Ensure `POLAR_WEBHOOK_SECRET` matches
   - Check app logs for signature errors

3. **Check webhook events:**
   - Ensure correct events are selected in Polar
   - Check Polar webhook delivery logs

### Checkout Not Working

1. **Check API credentials:**
   - Verify `POLAR_ACCESS_TOKEN` is correct
   - Check API key has correct permissions

2. **Check product/price ID:**
   - Verify `POLAR_PRO_PRODUCT_ID` or `POLAR_PRO_PRICE_ID` is correct
   - Ensure product exists in Polar

3. **Check URLs:**
   - Verify `APP_BASE_URL` is correct
   - Ensure success/cancel URLs are accessible

### Subscription Not Updating

1. **Check webhook handler:**
   - Verify webhook endpoint is receiving requests
   - Check app logs for errors

2. **Check database:**
   - Verify workspace exists
   - Check subscription update logic

3. **Check metadata:**
   - Ensure `slack_team_id` is in checkout metadata
   - Verify webhook can extract team ID

---

## Security Best Practices

1. **Never commit secrets:**
   - Use environment variables
   - Use secret management (Railway/Render secrets)

2. **Verify webhook signatures:**
   - Always verify Polar webhook signatures
   - Reject unsigned webhooks

3. **Rate limiting:**
   - Add rate limiting to webhook endpoint
   - Prevent abuse

4. **Logging:**
   - Log webhook events (without secrets)
   - Monitor for suspicious activity

---

## Next Steps

- [ ] Set up production webhook URL
- [ ] Test complete upgrade flow
- [ ] Monitor webhook delivery
- [ ] Set up alerts for failed webhooks
- [ ] Document customer support process

---

## Support

- [Polar.sh Documentation](https://docs.polar.sh)
- [Polar.sh Support](https://polar.sh/support)
- ReviewFlow Issues: Check GitHub repository

