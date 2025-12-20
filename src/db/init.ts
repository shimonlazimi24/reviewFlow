// Example initialization script for populating team members
// You can call this from index.ts or run it separately

import { db, Member } from './memoryDb';

/**
 * Initialize team members in the database
 * Call this function when the app starts to populate your team
 */
export function initializeTeamMembers(members: Omit<Member, 'id'>[]): void {
  for (const member of members) {
    const id = `member_${member.slackUserId}`;
    db.addMember({
      id,
      ...member
    });
  }
  console.log(`✅ Initialized ${members.length} team members`);
}

/**
 * Example usage:
 * 
 * initializeTeamMembers([
 *   {
 *     slackUserId: 'U01234567',
 *     githubUsernames: ['alice', 'alice-dev'],
 *     roles: ['FE'],
 *     weight: 1.0,
 *     isActive: true
 *   },
 *   {
 *     slackUserId: 'U01234568',
 *     githubUsernames: ['bob'],
 *     roles: ['BE'],
 *     weight: 1.0,
 *     isActive: true
 *   },
 *   {
 *     slackUserId: 'U01234569',
 *     githubUsernames: ['charlie'],
 *     roles: ['FS'],
 *     weight: 0.8, // Lower weight = gets more assignments
 *     isActive: true
 *   }
 * ]);
 */

