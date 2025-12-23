# Fix: "not_in_channel" Error

## Problem
You're getting an error: `Failed to send test message: An API error occurred: not_in_channel`

This means the ReviewFlow bot is trying to post to a channel it's not a member of.

## Solution: Invite the Bot to the Channel

The bot needs to be a member of the channel before it can post messages, even if it has `chat:write.public` permission.

### Method 1: Using `/invite` Command (Easiest)

1. Go to the channel where you want ReviewFlow to post (the one you configured)
2. Type: `/invite @reviewFlow`
   - Replace `reviewFlow` with your bot's actual name if different
3. Press Enter
4. The bot will be added to the channel
5. Try sending the test message again

### Method 2: Using Channel Settings

1. Go to the channel
2. Click the channel name at the top
3. Click **"Integrations"** tab
4. Click **"Add apps"**
5. Search for **ReviewFlow** (or your bot's name)
6. Click **"Add"**
7. Try sending the test message again

### Method 3: For Private Channels

If the channel is private:
1. Go to the channel
2. Click the channel name → **"Settings"**
3. Go to **"Integrations"** → **"Add apps"**
4. Find and add **ReviewFlow**

## Verify It Works

After inviting the bot:
1. Go back to ReviewFlow Home tab
2. Click **"📤 Send Test Message"**
3. You should see: `✅ Test message sent to #channel-name`
4. Check the channel - you should see the test message!

## For Production Use

When you configure ReviewFlow for production:
1. **Always invite the bot to the notification channel** during setup
2. The bot will automatically post PR notifications to that channel
3. If you change the channel later, remember to invite the bot to the new channel

## Common Issues

### "Bot is already in the channel but still getting error"
- Make sure you're using the correct channel ID
- Try removing and re-adding the bot
- Check if the channel is archived

### "Can't find the bot to invite"
- Make sure the bot is installed in your workspace
- Check the bot's name (it might be different from "reviewFlow")
- Go to **Apps** in Slack sidebar → Find ReviewFlow → Click to see the bot name

### "Works for test message but not for PR notifications"
- Make sure the bot is in the channel configured in your settings
- Check that `defaultChannelId` in your settings matches the channel you invited the bot to

