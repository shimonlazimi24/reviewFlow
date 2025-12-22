import dotenv from 'dotenv';
dotenv.config();

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),

  SLACK_SIGNING_SECRET: req('SLACK_SIGNING_SECRET'),
  SLACK_BOT_TOKEN: req('SLACK_BOT_TOKEN'),
  SLACK_DEFAULT_CHANNEL_ID: req('SLACK_DEFAULT_CHANNEL_ID'),

  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? '',

  JIRA_BASE_URL: process.env.JIRA_BASE_URL ?? '',
  JIRA_EMAIL: process.env.JIRA_EMAIL ?? '',
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ?? '',
  JIRA_AUTO_TRANSITION_ON_OPEN: (process.env.JIRA_AUTO_TRANSITION_ON_OPEN ?? 'false') === 'true',
  JIRA_AUTO_TRANSITION_ON_MERGE: (process.env.JIRA_AUTO_TRANSITION_ON_MERGE ?? 'false') === 'true',
  JIRA_OPEN_TRANSITION_NAME: process.env.JIRA_OPEN_TRANSITION_NAME ?? 'In Review',
  JIRA_MERGE_TRANSITION_NAME: process.env.JIRA_MERGE_TRANSITION_NAME ?? 'Done',
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY ?? '',
  JIRA_ISSUE_TYPE: process.env.JIRA_ISSUE_TYPE ?? 'Task',
  JIRA_DEFAULT_SPRINT_FIELD: process.env.JIRA_DEFAULT_SPRINT_FIELD ?? 'customfield_10020', // Default sprint field ID

  // Database
  DATABASE_URL: process.env.DATABASE_URL ?? '' // PostgreSQL connection string (Railway provides this)
};

export const jiraEnabled =
  Boolean(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN);

export const useDatabase = Boolean(env.DATABASE_URL);

