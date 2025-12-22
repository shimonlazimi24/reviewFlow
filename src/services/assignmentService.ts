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
}): Promise<Member[]> {
  const { stack, requiredReviewers, authorGithub } = args;
  const members = await db.listMembers();

  const candidates = await Promise.all(
    members
      .filter((m: Member) => m.isActive)
      .filter((m: Member) => !m.isUnavailable) // Skip unavailable members (sick/vacation)
      .filter((m: Member) => !m.githubUsernames.includes(authorGithub)) // לא להקצות למחבר
      .filter((m: Member) => {
        if (stack === 'MIXED') return true;
        if (m.roles.includes('FS')) return true;
        return m.roles.includes(stack);
      })
      .map(async (m: Member) => {
        const open = await db.getOpenAssignmentsCount(m.id);
        return {
          m,
          open,
          score: open / Math.max(0.1, m.weight)
        };
      })
  );

  candidates.sort((a, b) => a.score - b.score);

  return candidates.slice(0, requiredReviewers).map(x => x.m);
}

