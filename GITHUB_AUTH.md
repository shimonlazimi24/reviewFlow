# Fix GitHub Authentication

## The Problem
GitHub no longer accepts passwords for git operations. You need a **Personal Access Token**.

## Solution: Create Personal Access Token

### Step 1: Create Token on GitHub

1. Go to: https://github.com/settings/tokens
2. Click **"Generate new token"** → **"Generate new token (classic)"**
3. **Note:** Name it "ReviewFlow" (or any name)
4. **Expiration:** Choose how long (90 days, 1 year, or no expiration)
5. **Select scopes:** Check `repo` (this gives full repository access)
6. Scroll down and click **"Generate token"**

### Step 2: Copy the Token

⚠️ **IMPORTANT:** Copy the token immediately! You'll only see it once.

It will look like: `ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Step 3: Use Token When Pushing

When you run `git push`, it will ask for:
- **Username:** `shimonlazimi24`
- **Password:** Paste your Personal Access Token (NOT your GitHub password)

## Alternative: Use GitHub CLI (Easier)

If you prefer, install GitHub CLI:

```bash
brew install gh
gh auth login
```

Then you can push without entering credentials each time.

## Quick Fix Commands

After creating your token:

```bash
cd /Users/shimon.lazimi/Desktop/reviewflow/reviewflow
git push -u origin main
```

When prompted:
- Username: `shimonlazimi24`
- Password: `YOUR_PERSONAL_ACCESS_TOKEN` (paste the token)

## Or Use Token in URL (One-time)

You can also add the token to the URL (less secure, but works):

```bash
git remote set-url origin https://YOUR_TOKEN@github.com/shimonlazimi24/reviewflow.git
git push -u origin main
```

But the first method (entering when prompted) is more secure.

