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

export function pickReviewers(args: {
  stack: Stack;
  requiredReviewers: number;
  authorGithub: string;
}): Member[] {
  const { stack, requiredReviewers, authorGithub } = args;
  const members = db.listMembers();

  const candidates = members
    .filter(m => m.isActive)
    .filter(m => !m.githubUsernames.includes(authorGithub)) // לא להקצות למחבר
    .filter(m => {
      if (stack === 'MIXED') return true;
      if (m.roles.includes('FS')) return true;
      return m.roles.includes(stack);
    })
    .map(m => ({
      m,
      open: db.getOpenAssignmentsCount(m.id),
      score: db.getOpenAssignmentsCount(m.id) / Math.max(0.1, m.weight)
    }))
    .sort((a, b) => a.score - b.score);

  return candidates.slice(0, requiredReviewers).map(x => x.m);
}

