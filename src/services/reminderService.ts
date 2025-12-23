// Reminder service for overdue PR reviews
import { App } from '@slack/bolt';
import { db, Assignment, PrRecord, Member } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { formatDuration, calculateWaitingTime } from '../utils/time';
import { env } from '../config/env';
import { loadWorkspaceContext, hasFeature } from '../services/workspaceContext';

interface ReminderState {
  assignmentId: string;
  lastReminderAt?: number;
  reminderCount: number;
  escalated: boolean;
}

// In-memory reminder state (could be moved to DB for persistence)
const reminderStates = new Map<string, ReminderState>();

export class ReminderService {
  private slackApp: App;
  private intervalId?: NodeJS.Timeout;

  constructor(slackApp: App) {
    this.slackApp = slackApp;
  }

  start(): void {
    if (!env.REMINDER_ENABLED) {
      logger.info('Reminders are disabled');
      return;
    }

    const intervalMs = env.REMINDER_CHECK_INTERVAL_MINUTES * 60 * 1000;
    
    // Run immediately on start, then on interval
    this.checkAndSendReminders();
    
    this.intervalId = setInterval(() => {
      this.checkAndSendReminders();
    }, intervalMs);

    logger.info('Reminder service started', {
      checkInterval: `${env.REMINDER_CHECK_INTERVAL_MINUTES} minutes`,
      firstReminder: `${env.REMINDER_FIRST_HOURS} hours`,
      escalation: `${env.REMINDER_ESCALATION_HOURS} hours`
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Reminder service stopped');
    }
  }

  private async checkAndSendReminders(): Promise<void> {
    try {
      // Check if reminders are enabled globally
      if (!env.REMINDER_ENABLED) {
        return;
      }

      logger.debug('Checking for overdue PR reviews...');

      const members = await db.listMembers();
      const activeMembers = members.filter((m: Member) => m.isActive && !m.isUnavailable);

      if (activeMembers.length === 0) {
        logger.debug('No active members found, skipping reminder check');
        return;
      }

      // Group members by workspace (for now, use default workspace)
      // In production, you'd track which workspace each member belongs to
      const defaultTeamId = env.SLACK_DEFAULT_CHANNEL_ID; // Temporary
      
      if (!defaultTeamId) {
        logger.debug('No default team ID configured, skipping reminder check');
        return;
      }
      
      const context = await loadWorkspaceContext(defaultTeamId);

      // Check if reminders feature is available for this workspace
      if (!hasFeature(context, 'reminders')) {
        logger.debug('Reminders not available for workspace plan', { plan: context.plan });
        return;
      }

      const overdueAssignments: Array<{
        assignment: Assignment;
        pr: PrRecord;
        member: Member;
        waitingTime: number;
      }> = [];

      // Collect all overdue assignments
      for (const member of activeMembers) {
        const assignments = await db.getOpenAssignmentsForMember(member.id);
        
        for (const assignment of assignments) {
          if (assignment.status === 'DONE') continue;

          const pr = await db.getPr(assignment.prId);
          if (!pr || pr.status !== 'OPEN') continue;

          const waitingTime = calculateWaitingTime(assignment.createdAt);
          const waitingHours = waitingTime / (1000 * 60 * 60);

          // Check if overdue for first reminder
          if (waitingHours >= env.REMINDER_FIRST_HOURS) {
            overdueAssignments.push({
              assignment,
              pr,
              member,
              waitingTime
            });
          }
        }
      }

      logger.debug(`Found ${overdueAssignments.length} overdue assignments`);

      // Send reminders
      for (const { assignment, pr, member, waitingTime } of overdueAssignments) {
        await this.sendReminder(assignment, pr, member, waitingTime);
      }
    } catch (error) {
      logger.error('Error in reminder check', error);
    }
  }

  private async sendReminder(
    assignment: Assignment,
    pr: PrRecord,
    member: Member,
    waitingTime: number
  ): Promise<void> {
    const waitingHours = waitingTime / (1000 * 60 * 60);
    const stateKey = assignment.id;
    const state = reminderStates.get(stateKey) || {
      assignmentId: assignment.id,
      reminderCount: 0,
      escalated: false
    };

    // Check if we should send reminder
    const hoursSinceLastReminder = state.lastReminderAt
      ? (Date.now() - state.lastReminderAt) / (1000 * 60 * 60)
      : Infinity;

    // Don't spam - only remind every 12 hours max
    if (hoursSinceLastReminder < 12) {
      return;
    }

    // Escalate to channel if very overdue
    if (waitingHours >= env.REMINDER_ESCALATION_HOURS && !state.escalated) {
      await this.escalateToChannel(assignment, pr, member, waitingTime);
      state.escalated = true;
      state.lastReminderAt = Date.now();
      state.reminderCount++;
      reminderStates.set(stateKey, state);
      return;
    }

    // Send DM reminder
    if (waitingHours >= env.REMINDER_FIRST_HOURS) {
      await this.sendDmReminder(assignment, pr, member, waitingTime, state.reminderCount);
      state.lastReminderAt = Date.now();
      state.reminderCount++;
      reminderStates.set(stateKey, state);
    }
  }

  private async sendDmReminder(
    assignment: Assignment,
    pr: PrRecord,
    member: Member,
    waitingTime: number,
    reminderCount: number
  ): Promise<void> {
    try {
      const waitingStr = formatDuration(waitingTime);
      const urgency = reminderCount > 2 ? '🔴' : reminderCount > 1 ? '🟡' : '🟢';

      const message = `${urgency} *Reminder: PR Review Overdue*\n\n` +
        `*PR #${pr.number}:* ${pr.title}\n` +
        `*Repository:* ${pr.repoFullName}\n` +
        `*Author:* ${pr.authorGithub}\n` +
        `*Waiting time:* ${waitingStr}\n` +
        `*Status:* ${assignment.status}\n\n` +
        `<${pr.url}|Review PR on GitHub>`;

      try {
        await this.slackApp.client.chat.postMessage({
          channel: member.slackUserId,
          text: `Reminder: PR #${pr.number} review overdue`,
          blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '📋 Start Review'
                },
                style: 'primary',
                value: `${pr.id}|${member.id}`,
                action_id: 'take_review'
              },
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: '✅ Mark Done'
                },
                style: 'primary',
                value: `${pr.id}|${member.id}`,
                action_id: 'mark_done'
              }
            ]
          }
        ]
      });

      logger.info('Sent DM reminder', {
        assignmentId: assignment.id,
        memberId: member.id,
        prNumber: pr.number,
        waitingHours: waitingTime / (1000 * 60 * 60)
      });
      } catch (error: any) {
        // Handle invalid_auth gracefully
        if (error?.data?.error === 'invalid_auth') {
          logger.warn('Cannot send reminder - Slack authentication failed', {
            assignmentId: assignment.id,
            note: 'Please check your SLACK_BOT_TOKEN'
          });
          return; // Skip this reminder
        }
        logger.error('Failed to send DM reminder', error, {
          assignmentId: assignment.id,
          memberId: member.id
        });
      }
    } catch (error: any) {
      logger.error('Error in sendDmReminder', error);
    }
  }

  private async escalateToChannel(
    assignment: Assignment,
    pr: PrRecord,
    member: Member,
    waitingTime: number
  ): Promise<void> {
    try {
      const waitingStr = formatDuration(waitingTime);
      const message = `🔴 *Escalation: PR Review Overdue*\n\n` +
        `*PR #${pr.number}:* ${pr.title}\n` +
        `*Repository:* ${pr.repoFullName}\n` +
        `*Assigned to:* <@${member.slackUserId}>\n` +
        `*Waiting time:* ${waitingStr}\n` +
        `*Status:* ${assignment.status}\n\n` +
        `<${pr.url}|Review PR on GitHub>`;

      try {
        await this.slackApp.client.chat.postMessage({
          channel: pr.slackChannelId,
          text: `Escalation: PR #${pr.number} review overdue`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message
              }
            }
          ]
        });

        logger.info('Escalated to channel', {
          assignmentId: assignment.id,
          memberId: member.id,
          prNumber: pr.number,
          channelId: pr.slackChannelId,
          waitingHours: waitingTime / (1000 * 60 * 60)
        });
      } catch (error: any) {
        // Handle invalid_auth gracefully
        if (error?.data?.error === 'invalid_auth') {
          logger.warn('Cannot send escalation - Slack authentication failed', {
            assignmentId: assignment.id,
            note: 'Please check your SLACK_BOT_TOKEN'
          });
          return; // Skip this escalation
        }
        logger.error('Failed to escalate to channel', error, {
          assignmentId: assignment.id,
          memberId: member.id
        });
      }
    } catch (error: any) {
      logger.error('Error in escalateToChannel', error);
    }
  }

  // Clear reminder state (useful for testing or when assignment is completed)
  clearReminderState(assignmentId: string): void {
    reminderStates.delete(assignmentId);
  }
}

