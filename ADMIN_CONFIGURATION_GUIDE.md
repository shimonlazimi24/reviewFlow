# Admin Configuration Guide - Where to Configure Everything

This guide shows team managers/admins where to configure GitHub, Jira, and billing in ReviewFlow.

## 🎯 Quick Access: `/cr settings` Command

**The easiest way to access all configuration options:**

1. In any Slack channel or DM, type: `/cr settings`
2. This opens a **comprehensive settings modal** with all options:
   - ✅ GitHub connection
   - ✅ Jira connection  
   - ✅ Teams & Members management
   - ✅ Repository mapping
   - ✅ **Billing & Plan** (upgrade/payment)

---

## 📍 Where to Configure Each Feature

### 1. 🔗 Configure GitHub

**Method 1: Using `/cr settings` (Recommended)**
1. Type: `/cr settings`
2. In the modal, find **"Integrations"** section
3. Click **"🔗 Connect"** button next to GitHub (or **"🔧 Manage"** if already connected)
4. Click **"📦 Install GitHub App"** button
5. On GitHub, select which repositories to connect
6. Done! GitHub is now connected

**Method 2: Using Home Tab (if using full onboarding wizard)**
1. Open ReviewFlow → **Home** tab
2. Click **"Start Setup"** or **"Edit Settings"**
3. Follow the wizard → Step B: Connect GitHub

**What it does:**
- Connects your GitHub account to ReviewFlow
- Automatically sets up webhooks for selected repositories
- Enables PR notifications and reviewer assignment

---

### 2. 🎫 Configure Jira

**Method 1: Using `/cr settings` (Recommended)**
1. Type: `/cr settings`
2. In the modal, find **"Integrations"** section
3. Click **"🔗 Connect"** button next to Jira (or **"🔧 Manage"** if already connected)
4. Fill in the form:
   - **Jira Base URL**: `https://yourcompany.atlassian.net`
   - **Jira Email**: Your Jira account email
   - **Jira API Token**: Get from https://id.atlassian.com/manage-profile/security/api-tokens
5. Click **"Connect"**
6. Done! Jira is now connected

**Method 2: Using Home Tab (if using full onboarding wizard)**
1. Open ReviewFlow → **Home** tab
2. Click **"Start Setup"** or **"Edit Settings"**
3. Follow the wizard → Step C: Connect Jira (optional)

**⚠️ Important:**
- Jira integration requires a **Pro plan**
- You can connect Jira now, but it will only work after upgrading to Pro
- Free plan users will see: "Requires Pro plan to use"

**What it does:**
- Automatically creates Jira tickets when PRs are opened
- Updates ticket status when PRs are merged
- Links PRs to Jira tickets

---

### 3. 💳 Configure Billing / Upgrade to Pro

**Method 1: Using `/cr settings` (Recommended)**
1. Type: `/cr settings`
2. Scroll to **"💳 Billing & Plan"** section
3. You'll see:
   - Current plan (Free/Pro)
   - Usage stats
   - **"🚀 Upgrade to Pro"** button (if on Free plan)
   - **"💳 Manage Billing"** button (if on Pro plan)
4. Click the button to upgrade or manage subscription

**Method 2: Using `/upgrade` Command**
1. Type: `/upgrade` in any channel
2. Click **"🚀 Upgrade to Pro"** button
3. You'll be redirected to Polar checkout page
4. Complete payment
5. Your plan will be upgraded automatically

**Method 3: Using `/billing` Command**
1. Type: `/billing` in any channel
2. See current subscription status
3. Click **"💳 Manage Billing"** to update payment method, cancel, etc.

**What you get with Pro:**
- ✅ Unlimited teams, members, and repositories
- ✅ Jira Integration
- ✅ Auto Balance (distribute reviews evenly)
- ✅ Reminders (DM reviewers after X hours)
- ✅ Advanced Analytics
- ✅ API Access
- ✅ Custom Workflows

---

## 📋 Complete Settings Modal Overview

When you type `/cr settings`, you get access to:

### Section 1: Integrations
- **GitHub**: Connect/manage GitHub App installation
- **Jira**: Connect/manage Jira credentials (Pro required)

### Section 2: Teams & Members
- View team and member stats
- Add/remove team members
- Manage teams
- View member list

### Section 3: Repository Mapping
- Map GitHub repositories to teams
- Configure required reviewers per repo
- Set stack rules (FE/BE detection)

### Section 4: Billing & Plan
- View current plan and usage
- Upgrade to Pro
- Manage billing (for Pro users)

### Section 5: Available Features
- See which features are enabled based on your plan
- Get upgrade prompts for Pro-only features

---

## 🔐 Admin Access

**Who can configure these settings?**
- Workspace admins/owners
- The user who installed ReviewFlow
- Users in `ADMIN_SLACK_USER_IDS` environment variable (if set)

**Non-admins will see:**
- "Ask your workspace admin to complete setup"
- No access to configuration options

---

## 🚀 Quick Start Checklist

For a new workspace admin:

1. ✅ **Basic Setup** (Home Tab)
   - Click **"Start Setup"** in ReviewFlow Home tab
   - Configure notification channel
   - Set required reviewers
   - Configure reminder hours

2. ✅ **Connect GitHub** (`/cr settings`)
   - Open settings modal
   - Click **"Connect GitHub"**
   - Install GitHub App
   - Select repositories

3. ✅ **Connect Jira** (Optional, Pro required) (`/cr settings`)
   - Open settings modal
   - Click **"Connect Jira"**
   - Enter Jira credentials

4. ✅ **Add Team Members** (`/cr settings`)
   - Open settings modal
   - Go to **"Teams & Members"** section
   - Add members with their GitHub usernames

5. ✅ **Map Repositories** (`/cr settings`)
   - Open settings modal
   - Go to **"Repository Mapping"** section
   - Map repos to teams

6. ✅ **Upgrade to Pro** (if needed) (`/cr upgrade`)
   - Type `/upgrade` command
   - Complete checkout
   - Unlock Pro features

---

## 💡 Tips

- **All configuration is per-workspace** - Each Slack workspace has its own settings
- **Settings persist** - Your configuration is saved and won't be lost
- **Test before going live** - Use "Send Test Message" button to verify everything works
- **Pro features** - Some features (like Jira) require Pro plan, but you can configure them now and they'll activate after upgrade

---

## 🆘 Need Help?

- Check `/cr settings` for current configuration status
- Use `/cr help` for available commands
- Check logs if something isn't working
- Verify bot is invited to notification channel

