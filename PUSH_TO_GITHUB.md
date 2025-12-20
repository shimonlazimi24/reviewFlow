# How to Push Code to GitHub

## Step-by-Step Guide

### Step 1: Create GitHub Repository

1. Go to: https://github.com/new
2. **Repository name:** `reviewflow` (or any name you like)
3. **Description:** (optional) "Slack bot for managing code review assignments"
4. **Visibility:** 
   - Choose **Public** (free, anyone can see)
   - Or **Private** (only you can see)
5. **DO NOT** check:
   - ❌ Add a README file (we already have one)
   - ❌ Add .gitignore (we already have one)
   - ❌ Choose a license (optional, can add later)
6. Click **"Create repository"**

### Step 2: Copy Repository URL

After creating, GitHub will show you a page with commands. You'll see a URL like:
```
https://github.com/YOUR_USERNAME/reviewflow.git
```

**Copy this URL** - you'll need it in Step 6!

### Step 3: Initialize Git (in your project)

Run these commands in your terminal:

```bash
cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow
git init
```

### Step 4: Add All Files

```bash
git add .
```

This adds all files to git (except those in `.gitignore` like `.env` and `node_modules`)

### Step 5: Commit Files

```bash
git commit -m "Initial commit: ReviewFlow bot"
```

### Step 6: Connect to GitHub

Replace `YOUR_USERNAME` with your actual GitHub username:

```bash
git remote add origin https://github.com/YOUR_USERNAME/reviewflow.git
```

### Step 7: Push to GitHub

```bash
git branch -M main
git push -u origin main
```

You'll be asked for your GitHub username and password (or token).

**Done!** Your code is now on GitHub! 🎉

## Quick Command Summary

```bash
cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow
git init
git add .
git commit -m "Initial commit: ReviewFlow bot"
git remote add origin https://github.com/YOUR_USERNAME/reviewflow.git
git branch -M main
git push -u origin main
```

## Authentication

If you get authentication errors:

**Option 1: Use Personal Access Token**
1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`
4. Copy token
5. Use token as password when pushing

**Option 2: Use GitHub CLI**
```bash
brew install gh
gh auth login
```

## Verify It Worked

1. Go to: https://github.com/YOUR_USERNAME/reviewflow
2. You should see all your files!

## Next Steps

After pushing to GitHub:
1. Go to Railway: https://railway.app
2. New Project → Deploy from GitHub repo
3. Select your reviewflow repository
4. Deploy!

