import { Block, KnownBlock } from '@slack/bolt';
import { PrRecord, Member } from '../db/memoryDb';
import { JiraIssueMinimal } from '../services/jiraService';

interface BuildPrMessageBlocksArgs {
  pr: PrRecord;
  reviewers: Member[];
  jira?: JiraIssueMinimal;
}

const SIZE_EMOJI: Record<string, string> = {
  SMALL: '🟢',
  MEDIUM: '🟡',
  LARGE: '🔴'
};

const STACK_EMOJI: Record<string, string> = {
  FE: '🎨',
  BE: '⚙️',
  MIXED: '🔀'
};

export function buildPrMessageBlocks(args: BuildPrMessageBlocksArgs): (Block | KnownBlock)[] {
  const { pr, reviewers, jira } = args;

  // Add recommendation for large PRs
  const sizeWarning = pr.size === 'LARGE' 
    ? '\n⚠️ *This PR is LARGE. Consider splitting it into smaller PRs for easier review.*'
    : '';

  const blocks: (Block | KnownBlock)[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${SIZE_EMOJI[pr.size]} ${STACK_EMOJI[pr.stack]} PR #${pr.number}: ${pr.title}`
      }
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Repository:*\n${pr.repoFullName}`
        },
        {
          type: 'mrkdwn',
          text: `*Author:*\n${pr.authorGithub}`
        },
        {
          type: 'mrkdwn',
          text: `*Size:*\n${pr.size}${pr.totalChanges ? ` (${pr.totalChanges} lines)` : ''}`
        },
        {
          type: 'mrkdwn',
          text: `*Stack:*\n${pr.stack}`
        }
      ]
    },
    // Add detailed metadata if available
    ...(pr.changedFiles || pr.additions || pr.deletions ? [{
      type: 'section' as const,
      fields: [
        ...(pr.additions ? [{
          type: 'mrkdwn' as const,
          text: `*Additions:*\n+${pr.additions}`
        }] : []),
        ...(pr.deletions ? [{
          type: 'mrkdwn' as const,
          text: `*Deletions:*\n-${pr.deletions}`
        }] : []),
        ...(pr.changedFiles ? [{
          type: 'mrkdwn' as const,
          text: `*Files Changed:*\n${pr.changedFiles}`
        }] : [])
      ].filter(Boolean) as Array<{ type: 'mrkdwn'; text: string }>
    } as KnownBlock] : []),
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<${pr.url}|View PR on GitHub>${sizeWarning}`
      }
    }
  ];

  // Add warning block for large PRs
  if (pr.size === 'LARGE') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '⚠️ *Large PR Detected*\nThis PR is quite large. Consider splitting it into smaller, focused PRs for:\n• Faster reviews\n• Easier to understand\n• Lower risk of bugs\n• Better code quality'
      }
    });
  }

  // Add Jira info if available
  if (jira) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔗 Jira:* <${jira.url}|${jira.key}> - ${jira.summary}\n*Status:* ${jira.status}${jira.assignee ? ` | *Assignee:* ${jira.assignee}` : ''}`
      }
    });
  } else {
    // Add button to create Jira ticket if not linked
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: '📝 Create Jira Ticket'
          },
          style: 'primary',
          value: `${pr.id}`,
          action_id: 'create_jira_ticket'
        }
      ]
    });
  }

  // Add reviewers section
  if (reviewers.length > 0) {
    const reviewerMentions = reviewers.map(r => `<@${r.slackUserId}>`).join(', ');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*👥 Assigned Reviewers:*\n${reviewerMentions}`
      }
    });

    // Add action buttons for each reviewer
    const actions: any[] = [];
    for (const reviewer of reviewers) {
      // Add "Take Review" button (only if status is ASSIGNED)
      actions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: `📋 Start Review`
        },
        style: 'primary',
        value: `${pr.id}|${reviewer.id}`,
        action_id: 'take_review'
      });
      
      // Add "Mark Done" button
      actions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: `✅ Done`
        },
        style: 'primary',
        value: `${pr.id}|${reviewer.id}`,
        action_id: 'mark_done'
      });
    }

    // Add reassign button for assigned reviewers
    if (reviewers.length > 0) {
      actions.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: '🔄 Reassign PR'
        },
        style: 'danger',
        value: `${pr.id}`,
        action_id: 'reassign_pr'
      });
    }

    if (actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: actions.slice(0, 5) // Slack limits to 5 buttons per block
      });
    }
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*⚠️ No reviewers assigned*'
      }
    });
  }

  // Add divider
  blocks.push({ type: 'divider' });

  return blocks;
}

export function buildPrUpdateBlocks(args: BuildPrMessageBlocksArgs): (Block | KnownBlock)[] {
  // Similar to buildPrMessageBlocks but for updates
  return buildPrMessageBlocks(args);
}

