# User Management for ReviewFlow

## For End Users (How to Add Team Members)

Users can now manage team members directly from Slack - no code changes needed!

### Add a Reviewer

```
/add-reviewer <slack-user-id> <github-username> <role>
```

**Example:**
```
/add-reviewer U01234567 alice FE
```

**Roles:**
- `FE` - Frontend developer
- `BE` - Backend developer  
- `FS` - Full Stack developer

**To find Slack User ID:**
- Right-click user in Slack → View profile → More → Copy member ID
- Or mention them: `<@U01234567>` and check the user ID

### List All Reviewers

```
/list-reviewers
```

Shows all configured team members with their roles and GitHub usernames.

### Remove a Reviewer

```
/remove-reviewer <slack-user-id>
```

**Example:**
```
/remove-reviewer U01234567
```

This deactivates the reviewer (they won't get new assignments but existing ones remain).

### Set Reviewer Weight

```
/set-weight <slack-user-id> <weight>
```

**Example:**
```
/set-weight U01234567 0.8
```

**Weight explanation:**
- Lower weight = Gets more assignments (e.g., 0.5 for team leads)
- Higher weight = Gets fewer assignments (e.g., 1.5 for junior developers)
- Default: 1.0

## Available Commands Summary

| Command | Description | Example |
|---------|-------------|---------|
| `/add-reviewer` | Add team member | `/add-reviewer U01234567 alice FE` |
| `/list-reviewers` | List all reviewers | `/list-reviewers` |
| `/remove-reviewer` | Remove team member | `/remove-reviewer U01234567` |
| `/set-weight` | Set assignment weight | `/set-weight U01234567 0.8` |
| `/my-reviews` | List your pending reviews | `/my-reviews` |
| `/create-jira` | Create Jira ticket | `/create-jira Fix bug` |

## Setup Workflow for New Customers

1. **Install ReviewFlow** (deploy to Railway/Render)
2. **Configure Slack app** (add bot token, signing secret)
3. **Add team members via Slack:**
   ```
   /add-reviewer U01234567 alice FE
   /add-reviewer U01234568 bob BE
   /add-reviewer U01234569 charlie FS
   ```
4. **Verify setup:**
   ```
   /list-reviewers
   ```
5. **Set up GitHub webhook** (point to Railway URL)
6. **Done!** Create a PR to test

## Multi-GitHub Account Support

To add multiple GitHub usernames for one person:

```
/add-reviewer U01234567 alice FE
/add-reviewer U01234567 alice-dev FE
```

The system will merge them into one reviewer with multiple GitHub usernames.

## Multi-Role Support

To add multiple roles for one person:

```
/add-reviewer U01234567 alice FE
/add-reviewer U01234567 alice BE
```

The person will be assigned to both FE and BE PRs.

## Persistence

**Note:** Currently using in-memory database, so data is lost on restart.

**For production/selling:**
- Consider adding database persistence (PostgreSQL, MongoDB)
- Or export/import functionality
- Or configuration file that gets saved

## Future Enhancements

For a commercial product, consider:
- ✅ Database persistence (PostgreSQL)
- ✅ Admin dashboard
- ✅ Bulk import from CSV
- ✅ Slack workspace integration (auto-detect team)
- ✅ Role-based permissions
- ✅ Export/backup functionality

