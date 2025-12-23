import { db, Member, Role, Stack } from '../db/memoryDb';

export interface GitHubLabel {
  name?: string;
  [key: string]: any;
}

export function inferStackFromLabels(
  labels: GitHubLabel[] | any[],
  feLabels?: string,
  beLabels?: string
): Stack {
  const names = (labels ?? []).map(l => String(l?.name ?? '').toLowerCase());
  
  // Parse configured labels
  const configuredFELabels = feLabels 
    ? feLabels.split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
    : [];
  const configuredBELabels = beLabels 
    ? beLabels.split(',').map(l => l.trim().toLowerCase()).filter(Boolean)
    : [];
  
  // Check for FE labels (configured or defaults)
  const feLabelMatches = configuredFELabels.length > 0
    ? configuredFELabels.some(label => names.includes(label))
    : names.some(name => name.includes('frontend') || name === 'fe' || name.includes('ui') || name.includes('client'));
  
  // Check for BE labels (configured or defaults)
  const beLabelMatches = configuredBELabels.length > 0
    ? configuredBELabels.some(label => names.includes(label))
    : names.some(name => name.includes('backend') || name === 'be' || name.includes('api') || name.includes('server'));
  
  if (feLabelMatches && beLabelMatches) return 'MIXED';
  if (feLabelMatches) return 'FE';
  if (beLabelMatches) return 'BE';
  return 'MIXED'; // default
}

export async function pickReviewers(args: {
  workspaceId: string;
  stack: Stack;
  requiredReviewers: number;
  authorGithub: string;
  excludeMemberIds?: string[]; // Optional: exclude specific members (e.g., for reassignment)
  teamId?: string; // Optional: filter by team
  excludeCommitAuthors?: boolean; // Default: true - exclude commit authors
  commitAuthorLogins?: string[]; // GitHub usernames of commit authors
}): Promise<Member[]> {
  const { 
    workspaceId, 
    stack, 
    requiredReviewers, 
    authorGithub, 
    excludeMemberIds = [], 
    teamId,
    excludeCommitAuthors = true,
    commitAuthorLogins = []
  } = args;
  
  const members = await db.listMembers(workspaceId, teamId);

  // Build set of GitHub usernames to exclude
  const excludeGithubUsernames = new Set<string>();
  if (excludeCommitAuthors) {
    excludeGithubUsernames.add(authorGithub);
    commitAuthorLogins.forEach(login => excludeGithubUsernames.add(login));
  }

  // Get all assignments to calculate recent load and last assigned time
  const allAssignments = await Promise.all(
    members.map(async (m: Member) => {
      const openAssignments = await db.getOpenAssignmentsForMember(m.id);
      
      // Get all assignments for this member (including completed) to calculate recent load
      // We need to query all PRs in the workspace and find assignments for this member
      const allPRs = await db.listOpenPrs(workspaceId);
      const allMemberAssignments: any[] = [];
      for (const pr of allPRs) {
        const prAssignments = await db.getAssignmentsForPr(pr.id);
        const memberAssignments = prAssignments.filter((a: any) => a.memberId === m.id);
        allMemberAssignments.push(...memberAssignments);
      }
      
      // Calculate recent completed assignments (last 7 days)
      const recentCompleted = allMemberAssignments
        .filter((a) => a.completedAt && a.completedAt > Date.now() - 7 * 24 * 60 * 60 * 1000)
        .length;
      
      // Get last assigned time from most recent assignment (open or completed)
      const allAssignmentTimes = allMemberAssignments.map(a => a.createdAt);
      const lastAssignedAt = allAssignmentTimes.length > 0
        ? Math.max(...allAssignmentTimes)
        : 0;
      
      return {
        member: m,
        assignments: openAssignments,
        recentCompleted,
        lastAssignedAt
      };
    })
  );

  const candidates = allAssignments
    .filter(({ member: m }) => m.isActive)
    .filter(({ member: m }) => !m.isUnavailable) // Skip unavailable members (sick/vacation)
    .filter(({ member: m }) => {
      // Exclude if any of member's GitHub usernames match excluded authors
        if (excludeCommitAuthors) {
          return !m.githubUsernames.some((ghUser: string) => excludeGithubUsernames.has(ghUser));
        }
      return true;
    })
    .filter(({ member: m }) => !excludeMemberIds.includes(m.id)) // Exclude specific members
    .filter(({ member: m }) => {
      if (stack === 'MIXED') return true;
      if (m.roles.includes('FS')) return true;
      return m.roles.includes(stack);
    })
    .map(({ member: m, assignments, recentCompleted, lastAssignedAt }) => {
      const open = assignments.length;
      // Score calculation: lower is better
      // Normalized by weight to ensure fair distribution
      const score = open / Math.max(0.1, m.weight);
      
      // Calculate recent load (assignments completed in last 7 days)
      // Higher recent load = should be less likely to be picked
      const recentLoad = recentCompleted / Math.max(0.1, m.weight);
      
      return {
        m,
        open,
        score,
        recentLoad,
        lastAssignedAt
      };
    });

  // Sort by score (lowest first = least loaded)
  candidates.sort((a, b) => {
    // Primary sort: by score (workload/weight)
    if (Math.abs(a.score - b.score) > 0.01) {
      return a.score - b.score;
    }
    // Secondary sort: by recent load (if scores are very close, prefer less recently active)
    if (Math.abs(a.recentLoad - b.recentLoad) > 0.01) {
      return a.recentLoad - b.recentLoad;
    }
    // Tertiary sort: by last assigned time (prefer members who haven't been assigned recently)
    if (a.lastAssignedAt !== b.lastAssignedAt) {
      return a.lastAssignedAt - b.lastAssignedAt; // Lower timestamp = assigned longer ago = prefer
    }
    // Final tie-breaker: by absolute count
    return a.open - b.open;
  });

  return candidates.slice(0, requiredReviewers).map(x => x.m);
}

