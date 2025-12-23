import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

function req(name: string): string {
  const v = process.env[name];
  if (!v) {
    logger.error(`Missing required environment variable: ${name}`);
    throw new Error(`Missing env var: ${name}`);
  }
  return v;
}

function opt(name: string, defaultValue: string = ''): string {
  return process.env[name] ?? defaultValue;
}

function optBool(name: string, defaultValue: boolean = false): boolean {
  const v = process.env[name];
  if (!v) return defaultValue;
  return v.toLowerCase() === 'true' || v === '1';
}

function optNum(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (!v) return defaultValue;
  const num = Number(v);
  return isNaN(num) ? defaultValue : num;
}

export const env = {
  PORT: Number(process.env.PORT ?? 3000),

  SLACK_SIGNING_SECRET: req('SLACK_SIGNING_SECRET'),
  SLACK_BOT_TOKEN: opt('SLACK_BOT_TOKEN'), // Optional when using OAuth
  SLACK_DEFAULT_CHANNEL_ID: opt('SLACK_DEFAULT_CHANNEL_ID'), // Optional, per-workspace now
  
  // OAuth (for multi-workspace)
  SLACK_CLIENT_ID: opt('SLACK_CLIENT_ID'),
  SLACK_CLIENT_SECRET: opt('SLACK_CLIENT_SECRET'),
  SLACK_STATE_SECRET: opt('SLACK_STATE_SECRET'),

  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? '',
  GITHUB_APP_ID: opt('GITHUB_APP_ID'),
  GITHUB_APP_NAME: opt('GITHUB_APP_NAME', 'reviewflow'),

  JIRA_BASE_URL: process.env.JIRA_BASE_URL ?? '',
  JIRA_EMAIL: process.env.JIRA_EMAIL ?? '',
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN ?? '',
  JIRA_AUTO_TRANSITION_ON_OPEN: (process.env.JIRA_AUTO_TRANSITION_ON_OPEN ?? 'false') === 'true',
  JIRA_AUTO_TRANSITION_ON_MERGE: (process.env.JIRA_AUTO_TRANSITION_ON_MERGE ?? 'false') === 'true',
  JIRA_OPEN_TRANSITION_NAME: process.env.JIRA_OPEN_TRANSITION_NAME ?? 'In Review',
  JIRA_MERGE_TRANSITION_NAME: process.env.JIRA_MERGE_TRANSITION_NAME ?? 'Done',
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY ?? '',
  JIRA_ISSUE_TYPE: process.env.JIRA_ISSUE_TYPE ?? 'Task',
  JIRA_DEFAULT_SPRINT_FIELD: opt('JIRA_DEFAULT_SPRINT_FIELD', 'customfield_10020'),
  JIRA_AUTO_CREATE_ON_PR_OPEN: optBool('JIRA_AUTO_CREATE_ON_PR_OPEN', false),

  // Database
  DATABASE_URL: opt('DATABASE_URL'),

  // Logging
  LOG_LEVEL: opt('LOG_LEVEL', 'INFO'),

  // Application
  NODE_ENV: opt('NODE_ENV', 'development'),
  APP_NAME: opt('APP_NAME', 'reviewflow'),

  // Reminders
  REMINDER_ENABLED: optBool('REMINDER_ENABLED', true),
  REMINDER_FIRST_HOURS: optNum('REMINDER_FIRST_HOURS', 24), // First reminder after 24 hours
  REMINDER_ESCALATION_HOURS: optNum('REMINDER_ESCALATION_HOURS', 48), // Escalate to channel after 48 hours
  REMINDER_CHECK_INTERVAL_MINUTES: optNum('REMINDER_CHECK_INTERVAL_MINUTES', 60), // Check every hour

  // Billing (Polar.sh)
  POLAR_BASE_URL: opt('POLAR_BASE_URL', 'https://api.polar.sh'),
  POLAR_ACCESS_TOKEN: opt('POLAR_ACCESS_TOKEN'),
  POLAR_WEBHOOK_SECRET: opt('POLAR_WEBHOOK_SECRET'),
  POLAR_PRO_PRODUCT_ID: opt('POLAR_PRO_PRODUCT_ID'),
  POLAR_PRO_PRICE_ID: opt('POLAR_PRO_PRICE_ID'),
  APP_BASE_URL: opt('APP_BASE_URL', 'http://localhost:3000')
};

// Computed URLs
export const POLAR_SUCCESS_URL = `${env.APP_BASE_URL}/billing/success`;
export const POLAR_CANCEL_URL = `${env.APP_BASE_URL}/billing/cancel`;

export const jiraEnabled =
  Boolean(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN);

export const useDatabase = Boolean(env.DATABASE_URL);

