// Slack modal views for settings and configuration
import { View } from '@slack/bolt';
import { Member } from '../db/memoryDb';

/**
 * Build settings modal for team configuration
 */
export function buildSettingsModal(members: Member[]): View {
  const membersList = members.length > 0
    ? members.map((m, idx) => 
        `${idx + 1}. <@${m.slackUserId}> - ${m.githubUsernames.join(', ')} (${m.roles.join(', ')}) - Weight: ${m.weight}${m.isUnavailable ? ' 🏖️' : ''}`
      ).join('\n')
    : 'No team members configured yet.';

  return {
    type: 'modal',
    title: {
      type: 'plain_text',
      text: 'ReviewFlow Settings'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*👥 Current Team Members:*\n' + membersList
        }
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Quick Actions:*\nUse slash commands for faster management:'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: '*Add Reviewer:*\n`/add-reviewer <slack-id> <github> <role>`'
          },
          {
            type: 'mrkdwn',
            text: '*List Reviewers:*\n`/list-reviewers`'
          },
          {
            type: 'mrkdwn',
            text: '*Set Weight:*\n`/set-weight <slack-id> <weight>`'
          },
          {
            type: 'mrkdwn',
            text: '*Set Unavailable:*\n`/set-unavailable`'
          }
        ]
      },
      {
        type: 'divider'
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📊 Team Stats:*'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• Total members: ${members.length}\n• Active: ${members.filter(m => m.isActive && !m.isUnavailable).length}\n• Unavailable: ${members.filter(m => m.isUnavailable).length}`
        }
      }
    ],
    close: {
      type: 'plain_text',
      text: 'Close'
    }
  };
}

/**
 * Build add member modal
 */
export function buildAddMemberModal(): View {
  return {
    type: 'modal',
    callback_id: 'add_member_modal',
    title: {
      type: 'plain_text',
      text: 'Add Team Member'
    },
    submit: {
      type: 'plain_text',
      text: 'Add'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'input',
        block_id: 'slack_user_id',
        element: {
          type: 'users_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select Slack user'
          },
          action_id: 'slack_user'
        },
        label: {
          type: 'plain_text',
          text: 'Slack User'
        }
      },
      {
        type: 'input',
        block_id: 'github_username',
        element: {
          type: 'plain_text_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., alice-dev'
          },
          action_id: 'github'
        },
        label: {
          type: 'plain_text',
          text: 'GitHub Username'
        }
      },
      {
        type: 'input',
        block_id: 'role',
        element: {
          type: 'static_select',
          placeholder: {
            type: 'plain_text',
            text: 'Select role'
          },
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Frontend (FE)'
              },
              value: 'FE'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Backend (BE)'
              },
              value: 'BE'
            },
            {
              text: {
                type: 'plain_text',
                text: 'Full Stack (FS)'
              },
              value: 'FS'
            }
          ],
          action_id: 'role_select'
        },
        label: {
          type: 'plain_text',
          text: 'Role'
        }
      },
      {
        type: 'input',
        block_id: 'weight',
        element: {
          type: 'plain_text_input',
          placeholder: {
            type: 'plain_text',
            text: '1.0 (default)'
          },
          initial_value: '1.0',
          action_id: 'weight_input'
        },
        label: {
          type: 'plain_text',
          text: 'Weight (0.5-1.5)'
        },
        hint: {
          type: 'plain_text',
          text: 'Lower = more reviews, Higher = fewer reviews'
        },
        optional: true
      }
    ]
  };
}

/**
 * Build edit member modal
 */
export function buildEditMemberModal(member: Member): View {
  return {
    type: 'modal',
    callback_id: 'edit_member_modal',
    private_metadata: member.id,
    title: {
      type: 'plain_text',
      text: 'Edit Team Member'
    },
    submit: {
      type: 'plain_text',
      text: 'Save'
    },
    close: {
      type: 'plain_text',
      text: 'Cancel'
    },
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Editing:* <@${member.slackUserId}>`
        }
      },
      {
        type: 'input',
        block_id: 'github_username',
        element: {
          type: 'plain_text_input',
          placeholder: {
            type: 'plain_text',
            text: 'e.g., alice-dev, bob-dev'
          },
          initial_value: member.githubUsernames.join(', '),
          action_id: 'github'
        },
        label: {
          type: 'plain_text',
          text: 'GitHub Username(s)'
        },
        hint: {
          type: 'plain_text',
          text: 'Comma-separated for multiple usernames'
        }
      },
      {
        type: 'input',
        block_id: 'roles',
        element: {
          type: 'checkboxes',
          options: [
            {
              text: {
                type: 'plain_text',
                text: 'Frontend (FE)'
              },
              value: 'FE',
              description: {
                type: 'plain_text',
                text: 'Can review frontend PRs'
              }
            },
            {
              text: {
                type: 'plain_text',
                text: 'Backend (BE)'
              },
              value: 'BE',
              description: {
                type: 'plain_text',
                text: 'Can review backend PRs'
              }
            },
            {
              text: {
                type: 'plain_text',
                text: 'Full Stack (FS)'
              },
              value: 'FS',
              description: {
                type: 'plain_text',
                text: 'Can review any PR'
              }
            }
          ],
          initial_options: member.roles.map(role => ({
            text: {
              type: 'plain_text',
              text: role
            },
            value: role
          })),
          action_id: 'roles_checkbox'
        },
        label: {
          type: 'plain_text',
          text: 'Roles'
        }
      },
      {
        type: 'input',
        block_id: 'weight',
        element: {
          type: 'plain_text_input',
          placeholder: {
            type: 'plain_text',
            text: '1.0'
          },
          initial_value: String(member.weight),
          action_id: 'weight_input'
        },
        label: {
          type: 'plain_text',
          text: 'Weight'
        },
        hint: {
          type: 'plain_text',
          text: '0.5 = more reviews, 1.5 = fewer reviews'
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Active:* ${member.isActive ? '✅ Yes' : '❌ No'}`
          },
          {
            type: 'mrkdwn',
            text: `*Available:* ${member.isUnavailable ? '🏖️ No' : '✅ Yes'}`
          }
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: member.isActive ? '❌ Deactivate' : '✅ Activate'
            },
            style: member.isActive ? 'danger' : 'primary',
            value: member.id,
            action_id: 'toggle_member_active'
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: member.isUnavailable ? '✅ Mark Available' : '🏖️ Mark Unavailable'
            },
            style: member.isUnavailable ? 'primary' : 'danger',
            value: member.id,
            action_id: 'toggle_member_availability'
          }
        ]
      }
    ]
  };
}

