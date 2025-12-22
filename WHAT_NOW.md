# What's Next? - Final Setup Checklist

## ✅ What's Done

- ✅ Code complete and deployed
- ✅ TypeScript errors fixed
- ✅ PostgreSQL database support added
- ✅ Slack commands for user management added
- ✅ Basic Slack integration working (`/my-reviews` works)
- ✅ Deployed to Railway

## 📋 What's Left (Final Steps)

### Step 1: Enable Database (Optional but Recommended)

**If you want persistent storage:**

1. Railway dashboard → Your project
2. Make sure PostgreSQL database is linked to your service
3. Check `DATABASE_URL` is set in Variables
4. Redeploy if needed
5. Check logs - should see: `✅ Connected to PostgreSQL database`

**If you skip this:** Data will be lost on restart (but works for testing)

---

### Step 2: Register New Slack Commands

Go to: https://api.slack.com/apps → Your App → Slash Commands

Register these commands (all use same URL):

1. **`/add-reviewer`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `Add a team member as reviewer`

2. **`/list-reviewers`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `List all team reviewers`

3. **`/remove-reviewer`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `Remove a team reviewer`

4. **`/set-weight`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `Set reviewer assignment weight`

---

### Step 3: Add Your First Team Member

In Slack, test the new command:

```
/add-reviewer <your-slack-user-id> <your-github-username> FE
```

**To find your Slack User ID:**
- Right-click your name in Slack → View profile → More → Copy member ID
- Or use: https://api.slack.com/methods/users.list

**Example:**
```
/add-reviewer U01234567 shimonlazimi24 FE
```

Then verify:
```
/list-reviewers
```

---

### Step 4: Set Up GitHub Webhook (Optional)

**To get PR notifications:**

1. GitHub repo → Settings → Webhooks
2. Add webhook:
   - **Payload URL:** `https://reviewflow-production.up.railway.app/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** (optional) Your `GITHUB_WEBHOOK_SECRET`
   - **Events:** Select "Pull requests"
3. Click "Add webhook"

**Test it:**
- Create a test PR in your repo
- Check Slack channel for PR notification!

---

### Step 5: Test Everything

**Quick test checklist:**

- [ ] `/my-reviews` - Should work (already tested ✅)
- [ ] `/add-reviewer` - Add yourself
- [ ] `/list-reviewers` - See your team
- [ ] Create test PR - Should get Slack notification
- [ ] Click "✅ Done" button - Mark review complete
- [ ] `/create-jira` - Create Jira ticket (if Jira configured)

---

## 🎯 Priority Order

### Must Do (To Use the Bot):
1. ✅ Register `/add-reviewer` command
2. ✅ Add at least one team member
3. ✅ Test `/list-reviewers`

### Should Do (For Full Features):
4. ✅ Set up GitHub webhook
5. ✅ Test with real PR
6. ✅ Enable PostgreSQL (for persistence)

### Nice to Have:
7. ✅ Configure Jira (if using)
8. ✅ Add more team members
9. ✅ Customize settings

---

## 🚀 You're Almost Done!

**Current Status:**
- ✅ Bot is live and working
- ✅ Basic commands work
- ⚠️ Need to register new commands
- ⚠️ Need to add team members

**Next 5 Minutes:**
1. Register `/add-reviewer` in Slack
2. Add yourself as a reviewer
3. Test `/list-reviewers`
4. Done! 🎉

**Then (when ready):**
- Set up GitHub webhook
- Test with real PR
- Add more team members

---

## Quick Reference

**Your Railway URL:**
```
https://reviewflow-production.up.railway.app
```

**Slack Commands to Register:**
- `/add-reviewer` → `https://reviewflow-production.up.railway.app/slack/events`
- `/list-reviewers` → `https://reviewflow-production.up.railway.app/slack/events`
- `/remove-reviewer` → `https://reviewflow-production.up.railway.app/slack/events`
- `/set-weight` → `https://reviewflow-production.up.railway.app/slack/events`
- `/create-jira` → `https://reviewflow-production.up.railway.app/slack/events`

**Already Registered:**
- ✅ `/my-reviews` (already working)

---

## Need Help?

- **Can't find Slack User ID?** → Right-click user → View profile → More
- **Command not working?** → Check Request URL in Slack app settings
- **Database not connecting?** → Check `DATABASE_URL` in Railway variables
- **PR not appearing?** → Check GitHub webhook is configured

**You're 90% done! Just need to register commands and add team members!** 🚀

