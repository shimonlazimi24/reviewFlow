# Polar.sh Environment Variables

## Required Variables (for billing to work)

```bash
# Polar API Access Token (get from Polar.sh Dashboard → Settings → API Keys)
POLAR_ACCESS_TOKEN=polar_xxx

# Webhook Secret (generate when setting up webhook in Polar.sh)
POLAR_WEBHOOK_SECRET=your-random-secret-here

# Product ID OR Price ID (get from Polar.sh Dashboard → Products)
# You need AT LEAST ONE of these:
POLAR_PRO_PRODUCT_ID=prod_xxx  # Product ID (recommended)
# OR
POLAR_PRO_PRICE_ID=price_xxx   # Price ID (alternative)

# Your app's public URL (required for webhooks and redirects)
APP_BASE_URL=https://your-app.railway.app
```

## Optional Variables

```bash
# Polar API Base URL (defaults to https://api.polar.sh)
POLAR_BASE_URL=https://api.polar.sh
```

## Quick Setup Steps

1. **Get Access Token:**
   - Go to https://polar.sh/dashboard/settings
   - Navigate to **API Keys**
   - Click **Create API Key**
   - Copy the token (starts with `polar_`)

2. **Create Product:**
   - Go to https://polar.sh/dashboard
   - Navigate to **Products** → **Create Product**
   - Set name: "ReviewFlow Pro"
   - Set price and billing period
   - Copy the **Product ID** (starts with `prod_`)

3. **Set up Webhook:**
   - Go to https://polar.sh/dashboard/settings → **Webhooks**
   - Click **Add Webhook**
   - URL: `https://your-app.railway.app/webhooks/polar`
   - Generate a random secret (save it!)
   - Select events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.revoked`

4. **Add to your `.env` or deployment platform:**
   ```bash
   POLAR_ACCESS_TOKEN=polar_xxx
   POLAR_WEBHOOK_SECRET=your-webhook-secret
   POLAR_PRO_PRODUCT_ID=prod_xxx
   APP_BASE_URL=https://your-app.railway.app
   ```

## Validation

The app will validate that:
- If ANY Polar env var is set, then ALL required vars must be set
- `POLAR_ACCESS_TOKEN` is required
- `POLAR_WEBHOOK_SECRET` is required
- Either `POLAR_PRO_PRODUCT_ID` OR `POLAR_PRO_PRICE_ID` must be set
- `APP_BASE_URL` is required for billing redirects

## Testing

Without Polar configured, the app will:
- Show a message: "Billing Not Configured" when clicking the Billing button
- Allow all features in free mode
- Not crash or error

With Polar configured, the app will:
- Show upgrade buttons for free plans
- Create checkout sessions for upgrades
- Handle subscription webhooks automatically
- Update workspace plans based on subscription status

