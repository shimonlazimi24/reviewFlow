# Automatic Code Review Load Balancing

## 🎯 Overview

ReviewFlow **automatically balances** code review assignments across your team. No manual intervention needed!

---

## ⚖️ How Automatic Balancing Works

### The Algorithm

When a PR opens, the bot:

1. ✅ **Counts** each reviewer's open assignments
2. ✅ **Calculates** workload score: `open reviews / weight`
3. ✅ **Filters** out:
   - Inactive members
   - Unavailable members (sick/vacation)
   - PR author
   - Already assigned reviewers
4. ✅ **Assigns** to reviewer with **lowest score** (least loaded)
5. ✅ **Balances** workload automatically!

### Example

**Team:**
- Alice: 2 open reviews, weight 0.5 → score: 4.0
- Bob: 1 open review, weight 1.0 → score: 1.0
- Charlie: 0 open reviews, weight 1.0 → score: 0.0

**New PR opens:**
- ✅ Assigned to **Charlie** (lowest score = least loaded)
- Workload stays balanced!

---

## 📊 Monitor Team Workload

### `/team-workload` Command

See current distribution across your team:

```
/team-workload
```

**Shows:**
- Total open reviews
- Average per reviewer
- Individual workload for each team member
- Visual bars showing distribution
- Imbalance warnings (if any)

**Example Output:**
```
📊 Team Workload Distribution

Total Open Reviews: 8
Average per Reviewer: 2.7
Range: 0 - 5

Current Assignments:
🟢 @alice (alice-dev): 2 reviews
   ████░░░░░░ (weight: 0.5)
🟡 @bob (bob-dev): 4 reviews
   ████████░░ (weight: 1.0)
✅ @charlie (charlie-dev): 0 reviews
   ░░░░░░░░░░ (weight: 1.0)

⚠️ Workload Imbalances:
@bob has 4 reviews (1.5x average)

💡 Tip: Use /reassign-pr <pr-id> to redistribute reviews.
```

---

## 🔍 Enhanced `/list-reviewers` Command

Now shows workload for each reviewer:

```
/list-reviewers
```

**Shows:**
- ✅ Active and available
- 🏖️ Active but unavailable (sick/vacation)
- ❌ Inactive
- **Open reviews count** for each member

**Example:**
```
✅ @alice - alice-dev (FE) (2 open reviews)
✅ @bob - bob-dev (BE) (1 open review)
🏖️ @charlie - charlie-dev (FS) (0 open reviews)
```

---

## ⚙️ Weight System (Fine-Tuning)

### Default Behavior

**Default weight: 1.0** = Normal distribution
- Works perfectly for most teams
- No configuration needed!

### Adjusting Weight

Only adjust if you want to give someone more/fewer reviews:

```
/set-weight <slack-user-id> <weight>
```

**Examples:**
- `weight: 0.5` → Gets **2x more** reviews (senior/lead)
- `weight: 1.0` → Normal distribution (default)
- `weight: 1.5` → Gets **fewer** reviews (junior/less capacity)

**When to adjust:**
- Team lead can handle more → `0.5-0.8`
- Junior developer → `1.2-1.5`
- Regular developer → `1.0` (default)

---

## 🔄 Automatic Features

### 1. Smart Assignment

- ✅ Automatically picks least loaded reviewer
- ✅ Respects weight settings
- ✅ Skips unavailable members
- ✅ Skips PR author
- ✅ Works for FE, BE, and MIXED stacks

### 2. Load Balancing

- ✅ Distributes reviews evenly
- ✅ Prevents overload
- ✅ Adapts to team changes
- ✅ Real-time updates

### 3. Reassignment

- ✅ Easy reassignment if needed
- ✅ Button click or command
- ✅ Automatically finds best replacement
- ✅ Maintains balance

---

## 📈 Workload Indicators

### Status Colors

- ✅ **Green** - At or below average
- 🟡 **Yellow** - Above average but manageable
- 🔴 **Red** - Significantly above average (>1.5x)

### Imbalance Detection

The bot automatically detects when someone has:
- More than **1.5x** the average workload
- Suggests reassignment if needed

---

## 🎯 Best Practices

### 1. Regular Monitoring

Check workload weekly:
```
/team-workload
```

### 2. Adjust Weights (Optional)

Only if needed:
- Senior developers: `0.5-0.8`
- Regular developers: `1.0` (default)
- Junior developers: `1.2-1.5`

### 3. Use Reassignment

If someone is overloaded:
- Click "🔄 Reassign PR" button
- Or use: `/reassign-pr <pr-id>`

### 4. Mark Unavailable

When sick/on vacation:
```
/set-unavailable
```

---

## 🚀 Complete Flow

### When PR Opens:

1. **GitHub webhook** → Bot receives PR
2. **Bot analyzes:**
   - PR size, stack, author
   - Available reviewers
3. **Bot calculates workload:**
   - Counts open reviews for each reviewer
   - Divides by weight
   - Gets score for each
4. **Bot assigns:**
   - Picks reviewer with lowest score
   - Creates assignment
5. **Bot notifies:**
   - Posts to channel
   - Sends DM to reviewer
6. **Workload updates:**
   - Next PR will consider new assignment
   - Balance maintained automatically!

---

## 📋 Commands Summary

| Command | Description |
|---------|-------------|
| `/team-workload` | View team workload distribution |
| `/list-reviewers` | List reviewers with workload |
| `/set-weight <id> <weight>` | Adjust reviewer load (optional) |
| `/reassign-pr <pr-id>` | Reassign PR to balance load |
| `/set-unavailable` | Mark yourself unavailable |
| `/set-available` | Mark yourself available |

---

## ✅ Summary

**Automatic Balancing:**
- ✅ Works out of the box (no config needed)
- ✅ Real-time workload calculation
- ✅ Smart assignment algorithm
- ✅ Respects weight and availability
- ✅ Prevents overload

**Monitoring:**
- ✅ `/team-workload` - See distribution
- ✅ `/list-reviewers` - See individual loads
- ✅ Automatic imbalance detection

**Manual Override:**
- ✅ Reassign if needed
- ✅ Adjust weights if needed
- ✅ Mark unavailable when needed

**Everything is automatic! Just add team members and it works!** 🎉

---

## 🔧 Technical Details

### Score Calculation

```typescript
score = openReviews / weight
```

Lower score = less loaded = gets assigned first

### Assignment Priority

1. Active members only
2. Available (not sick/vacation)
3. Not PR author
4. Matches stack (FE/BE/FS)
5. Lowest score (least loaded)

### Reassignment

When reassigning:
- Excludes current reviewer
- Excludes unavailable members
- Picks best available replacement
- Maintains balance

---

**The bot handles everything automatically. Just use it!** 🚀

