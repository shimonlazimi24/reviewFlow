# ReviewFlow Deployment Guide

This guide covers deploying ReviewFlow to production environments (Railway, Render, etc.).

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database (or use Railway/Render managed PostgreSQL)
- GitHub App created and configured
- Slack App created and configured
- Polar.sh account (for billing)

## Environment Variables

### Required Variables

```bash
# Slack Configuration
SLACK_SIGNING_SECRET=your_slack_signing_secret
SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_STATE_SECRET=random_secret_for_oauth_state

# GitHub Configuration
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
GITHUB_APP_ID=your_github_app_id
GITHUB_APP_NAME=reviewflow
GITHUB_APP_PRIVATE_KEY=your_github_app_private_key_base64_or_pem

# Database
DATABASE_URL=postgresql://user:password@host:port/database

# Application
PORT=3000
NODE_ENV=production
APP_BASE_URL=https://your-app-domain.com

# Polar Billing (Optional)
POLAR_ACCESS_TOKEN=your_polar_access_token
POLAR_WEBHOOK_SECRET=your_polar_webhook_secret
POLAR_PRO_PRODUCT_ID=your_polar_pro_product_id
POLAR_PRO_PRICE_ID=your_polar_pro_price_id
```

### Optional Variables

```bash
# Encryption (for Jira tokens)
ENCRYPTION_KEY=32_character_random_string

# Admin Access Control
ADMIN_SLACK_USER_IDS=U1234567890,U0987654321  # Comma-separated Slack user IDs
ALLOW_ALL_WORKSPACE_ADMINS=true  # Allow all workspace admins to configure
```

## Deployment Steps

### 1. Railway Deployment

1. **Create a new Railway project**
   - Connect your GitHub repository
   - Railway will auto-detect the Node.js project

2. **Add PostgreSQL service**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will provide a `DATABASE_URL` automatically

3. **Configure Environment Variables**
   - Go to your service → "Variables"
   - Add all required environment variables from above

4. **Set up GitHub App**
   - Create a GitHub App at https://github.com/settings/apps
   - Set webhook URL: `https://your-railway-app.up.railway.app/webhooks/github`
   - Set webhook secret: `GITHUB_WEBHOOK_SECRET`
   - Generate a private key and base64 encode it: `cat private-key.pem | base64`
   - Set `GITHUB_APP_PRIVATE_KEY` to the base64 string or PEM content

5. **Set up Slack App**
   - Create a Slack App at https://api.slack.com/apps
   - Set OAuth redirect URL: `https://your-railway-app.up.railway.app/slack/oauth_redirect`
   - Set webhook URL: `https://your-railway-app.up.railway.app/slack/events`
   - Copy `Signing Secret` → `SLACK_SIGNING_SECRET`
   - Copy `Client ID` → `SLACK_CLIENT_ID`
   - Copy `Client Secret` → `SLACK_CLIENT_SECRET`
   - Generate `SLACK_STATE_SECRET`: `openssl rand -hex 32`

6. **Deploy**
   - Railway will automatically deploy on push to main
   - Check logs: Railway dashboard → "Deployments" → "View Logs"

### 2. Render Deployment

1. **Create a new Web Service**
   - Connect your GitHub repository
   - Select "Node" as environment
   - Build command: `npm install && npm run build`
   - Start command: `npm start`

2. **Add PostgreSQL Database**
   - Create a new PostgreSQL database
   - Copy the internal database URL

3. **Configure Environment Variables**
   - Go to "Environment" tab
   - Add all required environment variables

4. **Set up GitHub and Slack Apps**
   - Follow steps 4-5 from Railway deployment above
   - Use your Render URL: `https://your-app.onrender.com`

5. **Deploy**
   - Render will auto-deploy on push to main
   - Check logs: Render dashboard → "Logs"

## Database Migrations

The application automatically creates all required tables on first startup. No manual migrations needed.

Tables created:
- `workspaces` - Slack workspace configuration
- `workspace_settings` - Per-workspace settings
- `members` - Team members
- `teams` - Teams
- `repo_mappings` - Repository to team mappings
- `prs` - Pull requests
- `assignments` - Reviewer assignments
- `jira_connections` - Jira integration configs
- `slack_installations` - Slack OAuth installations
- `usage` - Usage tracking
- `audit_logs` - Audit logs
- `webhook_deliveries` - Webhook idempotency

## Webhook URLs

### GitHub Webhooks
- **URL**: `https://your-domain.com/webhooks/github`
- **Content Type**: `application/json`
- **Events**: `pull_request`, `installation`, `installation_repositories`
- **Secret**: Set to `GITHUB_WEBHOOK_SECRET`

### Polar Webhooks (Billing)
- **URL**: `https://your-domain.com/webhooks/polar`
- **Secret**: Set to `POLAR_WEBHOOK_SECRET`

### Slack Events
- **Request URL**: `https://your-domain.com/slack/events`
- **Signing Secret**: Set to `SLACK_SIGNING_SECRET`

## Health Checks

- **Health Endpoint**: `GET /health`
- **Readiness Endpoint**: `GET /ready`
- **Diagnostics**: `GET /diagnostics`

## Post-Deployment Checklist

- [ ] Verify database connection (check `/health` endpoint)
- [ ] Test GitHub webhook (create a test PR)
- [ ] Test Slack OAuth flow (install app in a test workspace)
- [ ] Verify Polar webhook (if using billing)
- [ ] Check logs for any errors
- [ ] Test onboarding wizard in Slack Home Tab
- [ ] Verify PR notifications are working

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check database is accessible from your deployment platform
- Ensure database has required extensions (PostgreSQL)

### GitHub Webhook Issues
- Verify webhook URL is accessible
- Check `GITHUB_WEBHOOK_SECRET` matches
- Verify GitHub App has correct permissions

### Slack OAuth Issues
- Verify redirect URL matches Slack app configuration
- Check `SLACK_CLIENT_ID` and `SLACK_CLIENT_SECRET`
- Ensure `SLACK_STATE_SECRET` is set

### PR Notifications Not Working
- Check `goLiveEnabled` is true in workspace
- Verify GitHub installation is connected
- Check team members are added and active
- Verify repo mappings are configured

## Security Notes

- Never commit `.env` files
- Use strong, random values for secrets
- Rotate secrets regularly
- Enable HTTPS (Railway/Render do this automatically)
- Use environment variable encryption if available

## Scaling

- The app is stateless and can be horizontally scaled
- Database connection pooling is handled automatically
- Consider using a managed Redis for rate limiting at scale

## Monitoring

- Check application logs regularly
- Monitor database connection pool usage
- Track webhook delivery success rates
- Monitor error rates via `/health` endpoint

