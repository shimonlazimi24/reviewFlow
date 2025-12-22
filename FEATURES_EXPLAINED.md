# ReviewFlow Features Explained

## 1. Weight System (Load Balancing) ⚖️

### What is Weight?

**Weight** controls how many code reviews each team member gets assigned.

- **Lower weight (0.5-0.8)** = Gets MORE assignments
  - Use for: Team leads, senior developers, people who can handle more
  - Example: `weight: 0.5` means they'll get 2x more reviews than someone with `weight: 1.0`

- **Higher weight (1.0-1.5)** = Gets FEWER assignments
  - Use for: Junior developers, people with less capacity
  - Example: `weight: 1.5` means they'll get fewer reviews

- **Default weight: 1.0** = Normal distribution

### How It Works

The bot calculates a "score" for each reviewer:
```
score = (number of open reviews) / weight
```

Lower score = gets assigned first (load balancing!)

### Example

**Team:**
- Alice (weight: 0.5) - Team lead, can handle more
- Bob (weight: 1.0) - Regular developer
- Charlie (weight: 1.5) - Junior, less capacity

**When PR opens:**
- Bot checks: Who has fewest reviews relative to their weight?
- Assigns to person with lowest score
- Automatically balances workload!

### Setting Weight

```
/set-weight <slack-user-id> <weight>
```

Example:
```
/set-weight U01234567 0.8  # Gets more assignments
/set-weight U01234568 1.2  # Gets fewer assignments
```

**You don't need to set weight!** Default (1.0) works fine. Only adjust if you want to give someone more/fewer reviews.

---

## 2. Direct Messages to Reviewers 📨

### What Happens When PR Opens

1. ✅ **Bot posts to channel** (everyone sees it)
2. ✅ **Bot sends DM to assigned reviewer** (NEW!)
   - Direct message with PR details
   - Quick link to PR
   - Size warning if PR is large

### Why This is Useful

- ✅ Reviewer gets **immediate notification**
- ✅ Doesn't get lost in channel noise
- ✅ Personal reminder
- ✅ Can't miss it!

---

## 3. Load Balancing (Automatic) ⚖️

### How It Works

The bot automatically:
1. ✅ Counts each reviewer's open assignments
2. ✅ Divides by their weight
3. ✅ Assigns to person with lowest score
4. ✅ Balances workload across team

### Example Scenario

**Current assignments:**
- Alice: 2 open reviews (weight: 0.5) → score: 4.0
- Bob: 1 open review (weight: 1.0) → score: 1.0
- Charlie: 0 open reviews (weight: 1.0) → score: 0.0

**New PR opens:**
- ✅ Assigned to **Charlie** (lowest score)
- Workload stays balanced!

**No manual work needed** - it's automatic!

---

## 4. Auto-Create Jira Tickets 🎫

### Option 1: Manual (Current Default)

- PR opens → Bot posts message
- Click "📝 Create Jira Ticket" button
- Ticket created on demand

### Option 2: Automatic (New Feature!)

Set environment variable:
```
JIRA_AUTO_CREATE_ON_PR_OPEN=true
```

**What happens:**
- PR opens → Bot automatically creates Jira ticket
- Links PR to ticket
- Adds to active sprint
- No button click needed!

### Enable Auto-Create

In Railway Variables:
```
JIRA_AUTO_CREATE_ON_PR_OPEN=true
```

---

## 5. Large PR Recommendations ✂️

### Automatic Detection

The bot automatically:
- ✅ Detects PR size (SMALL/MEDIUM/LARGE)
- ✅ Warns if PR is LARGE (>800 lines)
- ✅ Recommends splitting

### What You'll See

**In channel message:**
```
⚠️ Large PR Detected
This PR is quite large. Consider splitting it into smaller, focused PRs for:
• Faster reviews
• Easier to understand
• Lower risk of bugs
• Better code quality
```

**In reviewer's DM:**
```
Size: LARGE ⚠️ Consider splitting this PR
```

### PR Size Thresholds

- **SMALL:** ≤ 200 lines (🟢)
- **MEDIUM:** 201-800 lines (🟡)
- **LARGE:** > 800 lines (🔴) - Gets warning

---

## Complete Flow Example

### When PR Opens:

1. **GitHub webhook** → Bot receives PR event
2. **Bot analyzes PR:**
   - Size: LARGE (1200 lines)
   - Stack: FE (Frontend)
   - Author: alice
3. **Bot assigns reviewer:**
   - Checks all FE reviewers
   - Calculates load (open reviews / weight)
   - Assigns to Bob (lowest load)
4. **Bot creates Jira ticket** (if auto-create enabled)
5. **Bot sends notifications:**
   - Posts to channel with warning: "⚠️ Large PR - Consider splitting"
   - Sends DM to Bob: "📋 New PR Assigned to You"
6. **Bob reviews:**
   - Clicks "✅ Done" button
   - Bot updates message
   - Load balancing updates

---

## Configuration Summary

### Required
- `SLACK_BOT_TOKEN` - Bot token
- `SLACK_SIGNING_SECRET` - Signing secret
- `SLACK_DEFAULT_CHANNEL_ID` - Channel for PR notifications

### Optional (Load Balancing)
- Weight defaults to 1.0 (balanced)
- Only set if you want to adjust someone's load

### Optional (Jira)
- `JIRA_AUTO_CREATE_ON_PR_OPEN=true` - Auto-create tickets
- `JIRA_AUTO_TRANSITION_ON_OPEN=true` - Auto-transition to "In Review"
- `JIRA_AUTO_TRANSITION_ON_MERGE=true` - Auto-transition to "Done"

### Optional (Database)
- `DATABASE_URL` - For persistent storage (recommended)

---

## Summary

✅ **Weight** - Automatic load balancing (default 1.0 works fine)
✅ **Direct Messages** - Reviewers get notified immediately
✅ **Load Balancing** - Automatic, no configuration needed
✅ **Auto-Create Jira** - Set `JIRA_AUTO_CREATE_ON_PR_OPEN=true`
✅ **Large PR Warning** - Automatic detection and recommendation

**Everything works automatically! Just add team members and you're done!** 🎉

