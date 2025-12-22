# Adding PostgreSQL Database to ReviewFlow

## Why Add a Database?

Currently ReviewFlow uses **in-memory storage**, which means:
- ❌ Data is lost when server restarts
- ❌ Team members need to be re-added
- ❌ PR history is lost
- ❌ Not suitable for production/commercial use

## Solution: PostgreSQL Database

PostgreSQL provides:
- ✅ **Persistent storage** - Data survives restarts
- ✅ **Reliable** - Industry standard
- ✅ **Easy on Railway** - One-click database provisioning
- ✅ **Free tier available**

## Step 1: Add PostgreSQL to Railway

1. Go to Railway dashboard
2. Open your ReviewFlow project
3. Click **"New"** → **"Database"** → **"Add PostgreSQL"**
4. Railway will automatically:
   - Create a PostgreSQL database
   - Set `DATABASE_URL` environment variable
   - Connect it to your service

**That's it!** Railway handles everything.

## Step 2: Verify Environment Variable

1. Go to your service → **Variables** tab
2. You should see `DATABASE_URL` automatically added
3. It looks like: `postgresql://user:password@host:port/database`

## Step 3: Redeploy

Railway will automatically redeploy when you:
- Push new code (with database support)
- Or manually trigger redeploy

## How It Works

The code automatically:
- ✅ Detects `DATABASE_URL` environment variable
- ✅ Uses PostgreSQL if available
- ✅ Falls back to in-memory if not set
- ✅ Creates tables automatically on first run

## Migration from In-Memory

**If you already have data in memory:**
1. Add team members via Slack commands (they'll be saved to database)
2. Old in-memory data will be lost (but that's okay - it was temporary anyway)

## Testing

After deployment:
1. Add a reviewer: `/add-reviewer U01234567 alice FE`
2. Restart the service (or wait for Railway to restart)
3. Check: `/list-reviewers`
4. ✅ Data should still be there!

## Cost

**Railway PostgreSQL:**
- Free tier: 256 MB storage, 1 GB transfer/month
- Paid: $5/month for 1 GB storage

**For most teams:** Free tier is sufficient!

## Alternative: Other Databases

If you prefer other databases:
- **MongoDB** - NoSQL, good for flexible schemas
- **SQLite** - File-based, simpler but less scalable
- **Supabase** - PostgreSQL with extra features

But PostgreSQL is recommended for simplicity and Railway integration.

## Troubleshooting

**Database connection errors:**
- Check `DATABASE_URL` is set correctly
- Verify database is running in Railway
- Check Railway logs for connection errors

**Tables not created:**
- Check logs for initialization errors
- Database will auto-create tables on first connection

## Summary

✅ **Add PostgreSQL in Railway** (one click)  
✅ **Code automatically uses it** (no config needed)  
✅ **Data persists across restarts**  
✅ **Ready for production!**

Your ReviewFlow is now production-ready with persistent storage! 🎉

