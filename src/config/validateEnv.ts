// Environment validation - fail fast on startup
import { env } from './env';
import { logger } from '../utils/logger';

interface ValidationRule {
  name: string;
  required: boolean;
  validator?: (value: any) => boolean;
  message?: string;
}

const validationRules: ValidationRule[] = [
  {
    name: 'SLACK_SIGNING_SECRET',
    required: true,
    validator: (v) => v.length > 0,
    message: 'SLACK_SIGNING_SECRET must be a non-empty string'
  },
  {
    name: 'SLACK_BOT_TOKEN',
    required: true,
    validator: (v) => v.startsWith('xoxb-'),
    message: 'SLACK_BOT_TOKEN must start with xoxb-'
  },
  {
    name: 'SLACK_DEFAULT_CHANNEL_ID',
    required: true,
    validator: (v) => v.length > 0,
    message: 'SLACK_DEFAULT_CHANNEL_ID must be a valid channel ID'
  },
  {
    name: 'PORT',
    required: false,
    validator: (v) => v > 0 && v < 65536,
    message: 'PORT must be between 1 and 65535'
  },
];

export function validateEnvironment(): void {
  logger.info('Validating environment variables...');

  const errors: string[] = [];

  for (const rule of validationRules) {
    const value = (env as any)[rule.name] ?? process.env[rule.name];

    if (rule.required && (!value || value === '')) {
      errors.push(`Missing required environment variable: ${rule.name}`);
      continue;
    }

    if (value && rule.validator && !rule.validator(value)) {
      errors.push(rule.message || `Invalid value for ${rule.name}: ${value}`);
    }
  }

  // Validate Jira config if enabled
  if (env.JIRA_BASE_URL || env.JIRA_EMAIL || env.JIRA_API_TOKEN) {
    if (!env.JIRA_BASE_URL || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) {
      errors.push('Jira integration requires JIRA_BASE_URL, JIRA_EMAIL, and JIRA_API_TOKEN');
    }
  }

  if (errors.length > 0) {
    logger.error('Environment validation failed:', { errors });
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  logger.info('Environment validation passed');
}

