# Vacation/Sick Leave & PR Reassignment Features

## 🏖️ New Features

### 1. Mark Yourself Unavailable (Sick/Vacation)

When someone is sick or on vacation, they can mark themselves as unavailable:

```
/set-unavailable
```

**What happens:**
- ✅ You won't receive new PR assignments
- ✅ Bot automatically skips you when assigning reviewers
- ✅ Existing assignments stay (you can still complete them)
- ✅ You can mark yourself available again anytime

**To come back:**
```
/set-available
```

---

### 2. Reassign PR to Another Reviewer

If you're assigned a PR but can't review it (sick, vacation, too busy), you can reassign it:

#### Option 1: Button Click (Easiest)
1. Open the PR message in Slack
2. Click **"🔄 Reassign PR"** button
3. Bot automatically finds another available reviewer
4. New reviewer gets notified via DM

#### Option 2: Command
```
/reassign-pr <pr-id>
```

**To find PR ID:**
- Check the PR message in channel
- Or use `/my-reviews` to see your assignments with PR IDs

**What happens:**
- ✅ Old assignment is marked as done
- ✅ New reviewer is automatically assigned
- ✅ Bot picks best available reviewer (load balancing)
- ✅ New reviewer gets DM notification
- ✅ PR message in channel is updated
- ✅ Unavailable members are automatically skipped

---

## 🔄 How It Works

### Automatic Filtering

When assigning reviewers, the bot automatically:
1. ✅ Skips unavailable members (sick/vacation)
2. ✅ Skips the PR author
3. ✅ Skips already assigned reviewers
4. ✅ Picks best available reviewer (load balancing)

### Load Balancing

The bot uses the same load balancing algorithm:
- Checks each reviewer's open assignments
- Divides by their weight
- Assigns to person with lowest score
- **Automatically skips unavailable members**

---

## 📋 Commands Summary

### For Team Members

| Command | Description |
|---------|-------------|
| `/set-unavailable` | Mark yourself as unavailable (sick/vacation) |
| `/set-available` | Mark yourself as available again |
| `/reassign-pr <pr-id>` | Reassign a PR to another reviewer |
| `/my-reviews` | See your assigned PRs |

### For Admins

| Command | Description |
|---------|-------------|
| `/add-reviewer` | Add team member |
| `/list-reviewers` | List all reviewers |
| `/remove-reviewer` | Remove team member |
| `/set-weight` | Adjust reviewer load |

---

## 🎯 Use Cases

### Scenario 1: Going on Vacation

1. **Before vacation:**
   ```
   /set-unavailable
   ```
   - You won't get new PR assignments
   - Existing assignments stay (complete them before leaving)

2. **After vacation:**
   ```
   /set-available
   ```
   - You'll start receiving PR assignments again

### Scenario 2: Sick and Can't Review

1. **You're assigned a PR but feel sick:**
   - Click **"🔄 Reassign PR"** button in the PR message
   - Or use: `/reassign-pr <pr-id>`
   - Bot finds another reviewer automatically

2. **Mark yourself unavailable:**
   ```
   /set-unavailable
   ```
   - Prevents new assignments while you're sick

3. **When you're better:**
   ```
   /set-available
   ```

### Scenario 3: Too Busy

1. **You have too many reviews:**
   - Reassign some PRs: `/reassign-pr <pr-id>`
   - Or mark yourself unavailable temporarily: `/set-unavailable`

---

## 🔍 Status Indicators

When listing reviewers with `/list-reviewers`, you'll see:

- ✅ **Available** - Active and available
- ❌ **Inactive** - Not active (removed from team)
- 🏖️ **Unavailable** - Active but unavailable (sick/vacation)

---

## ⚙️ Technical Details

### Database Changes

- Added `isUnavailable` field to `Member` interface
- PostgreSQL: Column `is_unavailable BOOLEAN DEFAULT false`
- Automatically migrates existing databases

### Assignment Logic

The `pickReviewers` function now filters:
```typescript
.filter((m: Member) => m.isActive)
.filter((m: Member) => !m.isUnavailable)  // NEW!
.filter((m: Member) => !m.githubUsernames.includes(authorGithub))
```

### Reassignment Flow

1. User clicks "Reassign PR" or runs `/reassign-pr`
2. Bot finds current assignment
3. Bot picks new reviewer (excluding current one)
4. Marks old assignment as done
5. Creates new assignment
6. Updates Slack message
7. Sends DM to new reviewer

---

## 🚀 Next Steps

### Register New Commands

Go to: https://api.slack.com/apps → Your App → Slash Commands

Add these commands (all use same URL):

1. **`/set-unavailable`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `Mark yourself as unavailable (sick/vacation)`

2. **`/set-available`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `Mark yourself as available again`

3. **`/reassign-pr`**
   - Request URL: `https://reviewflow-production.up.railway.app/slack/events`
   - Description: `Reassign a PR to another reviewer`

---

## ✅ Summary

**New Features:**
- ✅ Mark unavailable (sick/vacation)
- ✅ Mark available (back from vacation)
- ✅ Reassign PR button in PR messages
- ✅ Reassign PR command
- ✅ Automatic filtering of unavailable members
- ✅ Load balancing respects availability

**Benefits:**
- ✅ No manual intervention needed
- ✅ Automatic load balancing
- ✅ Easy reassignment
- ✅ Prevents assignments to unavailable members
- ✅ Works seamlessly with existing features

**Everything is automatic! Just use the commands when needed!** 🎉

