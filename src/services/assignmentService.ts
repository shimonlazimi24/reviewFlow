import { db, Member, Role, Stack } from '../db/memoryDb';

export interface GitHubLabel {
  name?: string;
  [key: string]: any;
}

export function inferStackFromLabels(labels: GitHubLabel[] | any[]): Stack {
  const names = (labels ?? []).map(l => String(l?.name ?? '').toLowerCase());
  const hasFE = names.includes('frontend') || names.includes('fe');
  const hasBE = names.includes('backend') || names.includes('be');
  if (hasFE && hasBE) return 'MIXED';
  if (hasFE) return 'FE';
  if (hasBE) return 'BE';
  return 'MIXED'; // default
}

export async function pickReviewers(args: {
  stack: Stack;
  requiredReviewers: number;
  authorGithub: string;
  excludeMemberIds?: string[]; // Optional: exclude specific members (e.g., for reassignment)
  teamId?: string; // Optional: filter by team
}): Promise<Member[]> {
  const { stack, requiredReviewers, authorGithub, excludeMemberIds = [], teamId } = args;
  const members = await db.listMembers(teamId);

  const candidates = await Promise.all(
    members
      .filter((m: Member) => m.isActive)
      .filter((m: Member) => !m.isUnavailable) // Skip unavailable members (sick/vacation)
      .filter((m: Member) => !m.githubUsernames.includes(authorGithub)) // לא להקצות למחבר
      .filter((m: Member) => !excludeMemberIds.includes(m.id)) // Exclude specific members
      .filter((m: Member) => {
        if (stack === 'MIXED') return true;
        if (m.roles.includes('FS')) return true;
        return m.roles.includes(stack);
      })
      .map(async (m: Member) => {
        const open = await db.getOpenAssignmentsCount(m.id);
        // Score calculation: lower is better
        // Normalized by weight to ensure fair distribution
        const score = open / Math.max(0.1, m.weight);
        return {
          m,
          open,
          score
        };
      })
  );

  // Sort by score (lowest first = least loaded)
  candidates.sort((a, b) => {
    // Primary sort: by score (workload/weight)
    if (Math.abs(a.score - b.score) > 0.01) {
      return a.score - b.score;
    }
    // Secondary sort: by absolute count (if scores are very close)
    return a.open - b.open;
  });

  return candidates.slice(0, requiredReviewers).map(x => x.m);
}

