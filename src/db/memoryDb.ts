// In-memory database for PRs, members, and assignments

export type Role = 'FE' | 'BE' | 'FS'; // Frontend, Backend, Full Stack
export type PrStatus = 'OPEN' | 'CLOSED' | 'MERGED';
export type PrSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type Stack = 'FE' | 'BE' | 'MIXED';

export interface Member {
  id: string;
  slackUserId: string;
  githubUsernames: string[];
  roles: Role[];
  weight: number; // 0.0 to 1.0, affects assignment priority
  isActive: boolean;
}

export interface PrRecord {
  id: string;
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  authorGithub: string;
  createdAt: number;
  status: PrStatus;
  size: PrSize;
  stack: Stack;
  jiraIssueKey?: string;
  slackChannelId: string;
  slackMessageTs?: string;
}

export interface Assignment {
  id: string;
  prId: string;
  memberId: string;
  createdAt: number;
  completedAt?: number;
  slackUserId?: string; // for quick lookup
}

class MemoryDb {
  private members: Map<string, Member> = new Map();
  private prs: Map<string, PrRecord> = new Map();
  private assignments: Map<string, Assignment> = new Map();
  private prByRepoAndNumber: Map<string, PrRecord> = new Map(); // key: "repo/number"

  // Member operations
  addMember(member: Member): void {
    this.members.set(member.id, member);
  }

  getMember(id: string): Member | undefined {
    return this.members.get(id);
  }

  listMembers(): Member[] {
    return Array.from(this.members.values());
  }

  updateMember(id: string, updates: Partial<Member>): void {
    const existing = this.members.get(id);
    if (existing) {
      this.members.set(id, { ...existing, ...updates });
    }
  }

  // PR operations
  findPr(repoFullName: string, number: number): PrRecord | undefined {
    const key = `${repoFullName}#${number}`;
    return this.prByRepoAndNumber.get(key);
  }

  upsertPr(pr: PrRecord): PrRecord {
    const key = `${pr.repoFullName}#${pr.number}`;
    this.prs.set(pr.id, pr);
    this.prByRepoAndNumber.set(key, pr);
    return pr;
  }

  updatePr(id: string, updates: Partial<PrRecord>): void {
    const existing = this.prs.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.prs.set(id, updated);
      const key = `${updated.repoFullName}#${updated.number}`;
      this.prByRepoAndNumber.set(key, updated);
    }
  }

  getPr(id: string): PrRecord | undefined {
    return this.prs.get(id);
  }

  listOpenPrs(): PrRecord[] {
    return Array.from(this.prs.values()).filter(p => p.status === 'OPEN');
  }

  // Assignment operations
  createAssignments(prId: string, memberIds: string[]): Assignment[] {
    const assignments: Assignment[] = [];
    const pr = this.prs.get(prId);
    if (!pr) return assignments;

    for (const memberId of memberIds) {
      const member = this.members.get(memberId);
      if (!member) continue;

      const assignment: Assignment = {
        id: `assign_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        prId,
        memberId,
        createdAt: Date.now(),
        slackUserId: member.slackUserId
      };
      this.assignments.set(assignment.id, assignment);
      assignments.push(assignment);
    }
    return assignments;
  }

  getAssignmentsForPr(prId: string): Assignment[] {
    return Array.from(this.assignments.values()).filter(a => a.prId === prId);
  }

  getOpenAssignmentsForMember(memberId: string): Assignment[] {
    return Array.from(this.assignments.values())
      .filter(a => a.memberId === memberId && !a.completedAt);
  }

  getOpenAssignmentsCount(memberId: string): number {
    return this.getOpenAssignmentsForMember(memberId).length;
  }

  markAssignmentDone(assignmentId: string): boolean {
    const assignment = this.assignments.get(assignmentId);
    if (assignment && !assignment.completedAt) {
      assignment.completedAt = Date.now();
      return true;
    }
    return false;
  }

  markAssignmentDoneBySlackUser(prId: string, slackUserId: string): boolean {
    const assignments = this.getAssignmentsForPr(prId);
    const assignment = assignments.find(a => a.slackUserId === slackUserId && !a.completedAt);
    if (assignment) {
      return this.markAssignmentDone(assignment.id);
    }
    return false;
  }

  getAssignmentsBySlackUser(slackUserId: string): Assignment[] {
    return Array.from(this.assignments.values())
      .filter(a => a.slackUserId === slackUserId && !a.completedAt);
  }
}

export const db = new MemoryDb();

