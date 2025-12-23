# Slack App Directory Submission Checklist

Before submitting ReviewFlow to the Slack App Directory, ensure you've completed all requirements below.

## 📋 Pre-Submission Checklist

### 1. **App Information & Branding**

- [ ] **App Name**: ReviewFlow (or your chosen name)
- [ ] **App Icon**: 512x512px PNG (required)
- [ ] **App Description**: Clear, concise description of what ReviewFlow does
- [ ] **Long Description**: Detailed explanation of features and use cases
- [ ] **Screenshots**: 3-5 high-quality screenshots showing key features
- [ ] **Support Email**: Valid support email address
- [ ] **Privacy Policy URL**: Link to your privacy policy (required)
- [ ] **Terms of Service URL**: Link to your terms of service (if applicable)

### 2. **Technical Requirements**

- [ ] **Production URL**: App must be deployed and publicly accessible
- [ ] **HTTPS Required**: All endpoints must use HTTPS (no localhost)
- [ ] **Webhook URLs**: Configured and verified in Slack App settings
- [ ] **OAuth Redirect URLs**: Set correctly in App settings
- [ ] **App Home Tab**: Must be functional and show proper content
- [ ] **Error Handling**: Graceful error messages, no crashes

### 3. **Permissions (Scopes)**

Review your requested scopes - only request what you need:

**Current Scopes (verify these are all necessary):**
- [ ] `app_mentions:read` - For @mentions
- [ ] `app_home` - For Home Tab
- [ ] `channels:history` - For reading channel messages
- [ ] `channels:read` - For channel information
- [ ] `chat:write` - For posting messages
- [ ] `chat:write.public` - For posting to public channels
- [ ] `commands` - For slash commands
- [ ] `im:history` - For DM history
- [ ] `im:read` - For reading DMs
- [ ] `im:write` - For sending DMs
- [ ] `users:read` - For user information
- [ ] `users:read.email` - For user emails

**Remove any unused scopes** - Slack reviewers check this carefully!

### 4. **Functionality Testing**

- [ ] **Installation Flow**: Test OAuth installation from scratch
- [ ] **Home Tab**: Opens correctly and shows proper content
- [ ] **Slash Commands**: All commands work (`/cr settings`, `/upgrade`, etc.)
- [ ] **Buttons & Modals**: All interactive elements work
- [ ] **GitHub Integration**: GitHub App installation flow works
- [ ] **Jira Integration**: Jira connection works (if applicable)
- [ ] **PR Notifications**: GitHub webhooks trigger Slack messages correctly
- [ ] **Error Messages**: Clear, helpful error messages for users
- [ ] **No Test Data**: Remove any test commands, test data, or debug code

### 5. **Documentation**

- [ ] **Installation Instructions**: Clear steps for users to install
- [ ] **User Guide**: How to use ReviewFlow features
- [ ] **Support Documentation**: FAQ, troubleshooting guide
- [ ] **API Documentation**: If exposing APIs
- [ ] **Privacy Policy**: Must be publicly accessible
- [ ] **Terms of Service**: If applicable

### 6. **Security & Privacy**

- [ ] **Data Encryption**: Sensitive data (tokens, credentials) encrypted at rest
- [ ] **Secure Storage**: Database credentials and secrets properly secured
- [ ] **Webhook Verification**: GitHub webhook signatures verified
- [ ] **Rate Limiting**: Implemented on public endpoints
- [ ] **Error Logging**: No sensitive data in error logs
- [ ] **GDPR Compliance**: If serving EU users

### 7. **App Directory Specific**

- [ ] **App Category**: Select appropriate category (Productivity, Developer Tools, etc.)
- [ ] **Pricing Information**: If using billing, clearly state pricing
- [ ] **Free Trial**: If applicable, clearly state trial period
- [ ] **Support Channels**: Support email, documentation links
- [ ] **Test Account**: Provide test credentials if app requires external services

### 8. **Code Quality**

- [ ] **No Console Logs**: Remove or replace with proper logging
- [ ] **Error Handling**: All async operations have error handling
- [ ] **Code Comments**: Clear comments for complex logic
- [ ] **Environment Variables**: All required env vars documented
- [ ] **Dependencies**: All dependencies up to date and secure

### 9. **User Experience**

- [ ] **Onboarding**: Clear setup flow for new users
- [ ] **Error Messages**: User-friendly, actionable error messages
- [ ] **Help Text**: Clear instructions in modals and messages
- [ ] **Loading States**: Show loading indicators for async operations
- [ ] **Confirmation Messages**: Confirm actions (e.g., "Settings saved")

### 10. **Production Readiness**

- [ ] **Database**: Using PostgreSQL in production (not in-memory)
- [ ] **Environment Variables**: All required vars set in production
- [ ] **Monitoring**: Error tracking and logging set up
- [ ] **Backup Strategy**: Database backups configured
- [ ] **Uptime**: App is stable and doesn't crash
- [ ] **Performance**: App responds quickly (< 3 seconds)

## 🔍 Common Rejection Reasons

Slack commonly rejects apps for:

1. **Too Many Permissions**: Requesting scopes you don't use
2. **Broken Functionality**: Features that don't work
3. **Poor Error Handling**: Crashes or unclear errors
4. **Missing Documentation**: No user guide or support info
5. **Privacy Issues**: No privacy policy or unclear data handling
6. **Test Data**: App still has test commands or debug code
7. **Unstable**: App crashes or has frequent errors
8. **Incomplete**: Features marked as "coming soon" or unfinished

## 📝 Submission Process

1. **Go to**: https://app.slack.com/app-settings/T0A4D4NF3RD/A0A57J78T0R/submission
2. **Fill out all required fields**
3. **Upload screenshots and assets**
4. **Submit for review**
5. **Wait for review** (typically 2-4 weeks)
6. **Respond to feedback** if requested

## 🚀 Quick Pre-Submission Test

Run through this test flow:

1. **Fresh Installation**:
   - Install app in a test workspace
   - Complete onboarding flow
   - Verify Home Tab shows correctly

2. **Core Features**:
   - Set up GitHub connection
   - Configure notification channel
   - Create a test PR and verify notification

3. **Error Scenarios**:
   - Test with invalid GitHub token
   - Test with missing permissions
   - Verify error messages are clear

4. **User Experience**:
   - Test all slash commands
   - Test all buttons and modals
   - Verify help text is clear

## 📚 Resources

- [Slack Developer Policy](https://api.slack.com/developer-policy)
- [Slack Marketplace Review Guide](https://api.slack.com/slack-marketplace/review-guide)
- [Slack App Directory Requirements](https://api.slack.com/developer-policies)

## ✅ Final Checklist Before Clicking Submit

- [ ] All functionality tested and working
- [ ] No test data or debug code
- [ ] All required documentation complete
- [ ] Privacy policy published
- [ ] Support email verified
- [ ] App is stable in production
- [ ] All scopes are necessary and used
- [ ] Error handling is comprehensive
- [ ] User experience is polished

---

**Good luck with your submission!** 🎉

If you need help with any specific item, check the Slack API documentation or reach out to Slack's developer support.

