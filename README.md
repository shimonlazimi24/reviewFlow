# ReviewFlow 🤖

A Slack bot that automatically manages code review assignments for your development team. Integrates with GitHub and Jira to streamline your PR review process.

## Features

- ✅ **Automatic Reviewer Assignment** - Intelligently assigns reviewers based on PR stack (FE/BE/MIXED)
- ✅ **Slack Integration** - Beautiful PR notifications with interactive buttons
- ✅ **Jira Integration** - Create tickets, link to PRs, manage sprints
- ✅ **Review Tracking** - Track review completion status
- ✅ **Smart Load Balancing** - Distributes reviews evenly across team members
- ✅ **PR Size Detection** - Automatically categorizes PRs (Small/Medium/Large)

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create `.env` file (see `.env.example`)

3. **Start the server:**
   ```bash
   npm run dev
   ```

4. **Test it:**
   ```bash
   npm run test:health
   ```

See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions.

## Documentation

- **[NEXT_STEPS.md](./NEXT_STEPS.md)** - Complete setup and deployment guide ⭐ **START HERE**
- **[QUICKSTART.md](./QUICKSTART.md)** - Quick 5-minute testing guide
- **[TESTING.md](./TESTING.md)** - Comprehensive testing instructions

## Project Structure

```
src/
├── index.ts                 # Main entry point
├── config/
│   └── env.ts               # Environment configuration
├── db/
│   ├── memoryDb.ts          # In-memory database
│   └── init.ts              # Team member initialization
├── services/
│   ├── assignmentService.ts # Reviewer assignment logic
│   └── jiraService.ts       # Jira API integration
├── slack/
│   ├── blocks.ts            # Slack message formatting
│   └── handlers.ts          # Slack command handlers
├── github/
│   └── webhookHandler.ts    # GitHub webhook processing
└── utils/
    ├── jiraKey.ts           # Jira key extraction
    └── prSizing.ts           # PR size calculation
```

## Environment Variables

### Required
- `SLACK_SIGNING_SECRET` - Slack app signing secret
- `SLACK_BOT_TOKEN` - Slack bot token (xoxb-...)
- `SLACK_DEFAULT_CHANNEL_ID` - Default Slack channel for PR notifications

### Optional
- `GITHUB_WEBHOOK_SECRET` - GitHub webhook secret
- `JIRA_BASE_URL` - Jira instance URL
- `JIRA_EMAIL` - Jira account email
- `JIRA_API_TOKEN` - Jira API token
- `JIRA_PROJECT_KEY` - Default Jira project key

See `.env.example` for all available options.

## Commands

### Development
```bash
npm run dev      # Start development server with hot reload
npm run build    # Build for production
npm start        # Run production build
```

### Testing
```bash
npm run test:health   # Test health endpoint
npm run test:webhook  # Test GitHub webhook
```

## Slack Commands

- `/my-reviews` - List your pending code reviews
- `/create-jira <summary>` - Create a Jira ticket

## How It Works

1. **GitHub PR Created** → Webhook triggers
2. **Analyze PR** → Extract stack (FE/BE), size, Jira key
3. **Assign Reviewers** → Smart algorithm selects reviewers
4. **Post to Slack** → Beautiful message with PR details
5. **Track Reviews** → Team members mark reviews as done
6. **Jira Integration** → Optional ticket creation and linking

## Configuration

### Initialize Team Members

Edit `src/index.ts` and add:

```typescript
import { initializeTeamMembers } from './db/init';

initializeTeamMembers([
  {
    slackUserId: 'U01234567',
    githubUsernames: ['username'],
    roles: ['FE'], // or 'BE', 'FS'
    weight: 1.0,
    isActive: true
  }
]);
```

### Customize Reviewer Selection

Edit `src/services/assignmentService.ts` to adjust:
- Required number of reviewers
- Stack matching logic
- Load balancing algorithm

## Deployment

See [NEXT_STEPS.md](./NEXT_STEPS.md) for detailed deployment instructions.

**Quick deploy options:**
- **Heroku** - Easiest, free tier available
- **Railway** - Simple, modern platform
- **DigitalOcean** - Reliable, affordable
- **AWS/Google Cloud/Azure** - Enterprise options

## Troubleshooting

**Bot not responding?**
- Check Slack token and signing secret
- Verify bot is invited to channel
- Check bot has required scopes

**Webhook not working?**
- Verify webhook URL is correct
- Check GitHub webhook secret matches
- Review application logs

**No reviewers assigned?**
- Ensure team members are initialized
- Check member `isActive` status
- Verify roles match PR stack

See [TESTING.md](./TESTING.md) for more troubleshooting tips.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT

## Support

- Check documentation files in this directory
- Review console logs for error messages
- Verify environment variables are set correctly

---

**Ready to get started?** → See [NEXT_STEPS.md](./NEXT_STEPS.md) 🚀


