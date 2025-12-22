# Full Stack (FS) Developer Support

## How Full Stack Developers Work in ReviewFlow

Full Stack (FS) developers are **special** - they can review **any type of PR** (Frontend, Backend, or Mixed).

### Assignment Logic

When a PR is opened, ReviewFlow:

1. **Detects PR stack** from GitHub labels:
   - `frontend` or `fe` → FE stack
   - `backend` or `be` → BE stack
   - Both labels → MIXED stack
   - No labels → MIXED stack (default)

2. **Selects reviewers** based on:
   - **FE PRs** → Can be reviewed by:
     - ✅ FE developers (role: `FE`)
     - ✅ Full Stack developers (role: `FS`)
   
   - **BE PRs** → Can be reviewed by:
     - ✅ BE developers (role: `BE`)
     - ✅ Full Stack developers (role: `FS`)
   
   - **MIXED PRs** → Can be reviewed by:
     - ✅ FE developers (role: `FE`)
     - ✅ BE developers (role: `BE`)
     - ✅ Full Stack developers (role: `FS`)
     - ✅ Anyone!

### Example Scenarios

#### Scenario 1: Frontend PR
```
PR Labels: ["frontend"]
PR Stack: FE

Available Reviewers:
- Alice (FE) ✅
- Bob (FS) ✅
- Charlie (BE) ❌ (not assigned)
```

#### Scenario 2: Backend PR
```
PR Labels: ["backend"]
PR Stack: BE

Available Reviewers:
- Alice (FE) ❌ (not assigned)
- Bob (FS) ✅
- Charlie (BE) ✅
```

#### Scenario 3: Mixed PR
```
PR Labels: ["frontend", "backend"]
PR Stack: MIXED

Available Reviewers:
- Alice (FE) ✅
- Bob (FS) ✅
- Charlie (BE) ✅
- Everyone can review!
```

### Adding Full Stack Developers

To add a full stack developer:

```bash
/add-reviewer U01234567 alice FS
```

This gives them the `FS` role, which means they can review:
- ✅ Frontend PRs
- ✅ Backend PRs
- ✅ Mixed PRs

### Multiple Roles

You can also give someone **multiple roles**:

```bash
# First add as FE
/add-reviewer U01234567 alice FE

# Then add FS role (adds to existing roles)
/add-reviewer U01234567 alice FS
```

Now Alice has both `FE` and `FS` roles, so she can review everything!

### Load Balancing

Full Stack developers are included in load balancing:
- They get assigned PRs based on their current workload
- Lower workload = more likely to be assigned
- Weight system still applies (lower weight = more reviews)

### Best Practices

1. **For small teams:**
   - Make everyone Full Stack (`FS`)
   - Everyone can review everything
   - Simple and flexible

2. **For larger teams:**
   - Have specialized FE/BE developers
   - Have a few FS developers as backup
   - FS developers help balance workload

3. **For mixed teams:**
   - Frontend specialists: `FE`
   - Backend specialists: `BE`
   - Generalists: `FS`
   - Senior developers: `FS` (can review anything)

### Code Reference

The logic is in `src/services/assignmentService.ts`:

```typescript
.filter((m: Member) => {
  if (stack === 'MIXED') return true;  // Everyone can review mixed
  if (m.roles.includes('FS')) return true;  // FS can review anything
  return m.roles.includes(stack);  // Must match stack
})
```

This means:
- **MIXED PRs** → All members eligible
- **FS role** → Can review any stack
- **Otherwise** → Must match stack (FE for FE, BE for BE)

---

## Summary

✅ **Full Stack (FS) developers can review ANY PR type**
✅ **They're included in load balancing**
✅ **They help balance workload across the team**
✅ **Perfect for senior developers or generalists**

Just add them with:
```bash
/add-reviewer <slack-id> <github-username> FS
```

