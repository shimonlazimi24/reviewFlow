// Repository configuration modal for stack path rules
import { View } from '@slack/bolt';
import { StackRule } from '../db/memoryDb';

/**
 * Build repository configuration modal for managing stack path rules
 */
export function buildRepoConfigModal(
  workspaceId: string,
  repoFullName: string,
  existingRules: StackRule[] = [],
  requiredReviewers: number = 2
): View {
  // Build initial rules text (one per line: glob => stack)
  const rulesText = existingRules.length > 0
    ? existingRules.map(r => `${r.glob} => ${r.stack}`).join('\n')
    : '';

  return {
    type: 'modal',
    callback_id: 'repo_config_submit',
    title: {
      type: 'plain_text',
      text: 'Configure Repository'
    },
    submit: {
      type: 'plain_text',
      text: 'Save Configuration'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    private_metadata: JSON.stringify({ workspaceId, repoFullName }),
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Configure Stack Path Rules for \`${repoFullName}\`*\n\nDefine path patterns to automatically infer stack (FE/BE/MIXED) when PR labels are missing.`
        }
      },
      { type: 'divider' },
      {
        type: 'input',
        block_id: 'required_reviewers',
        label: { type: 'plain_text', text: 'Required Reviewers' },
        element: {
          type: 'plain_text_input',
          action_id: 'required_reviewers',
          initial_value: String(requiredReviewers),
          placeholder: { type: 'plain_text', text: '2' }
        },
        hint: {
          type: 'plain_text',
          text: 'Number of reviewers to assign for PRs in this repository'
        }
      },
      {
        type: 'input',
        block_id: 'stack_rules',
        label: { type: 'plain_text', text: 'Stack Path Rules' },
        element: {
          type: 'plain_text_input',
          action_id: 'stack_rules',
          multiline: true,
          initial_value: rulesText,
          placeholder: { type: 'plain_text', text: 'client/** => FE\nserver/** => BE\nshared/** => MIXED' }
        },
        hint: {
          type: 'plain_text',
          text: 'One rule per line: `glob-pattern => FE|BE|MIXED`\nExample: `client/** => FE` means files in client/ folder are Frontend'
        },
        optional: true
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '💡 *Tip:* Use glob patterns like `client/**`, `server/**`, `*.tsx`, etc. If both FE and BE paths match, stack will be MIXED.'
        }]
      }
    ]
  };
}

/**
 * Parse stack rules from text input
 */
export function parseStackRules(text: string): StackRule[] {
  if (!text || !text.trim()) {
    return [];
  }

  const rules: StackRule[] = [];
  const lines = text.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const match = line.match(/^(.+?)\s*=>\s*(FE|BE|MIXED)$/i);
    if (match) {
      const glob = match[1].trim();
      const stack = match[2].toUpperCase() as 'FE' | 'BE' | 'MIXED';
      if (glob && ['FE', 'BE', 'MIXED'].includes(stack)) {
        rules.push({ glob, stack });
      }
    }
  }

  return rules;
}

