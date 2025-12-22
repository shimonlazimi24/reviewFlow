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
  isUnavailable: boolean; // true if sick, on vacation, etc.
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

  // Member operations (async for compatibility with PostgreSQL)
        async addMember(member: Member): Promise<void> {
          // Ensure isUnavailable defaults to false
          const memberWithDefaults = {
            ...member,
            isUnavailable: member.isUnavailable ?? false
          };
          this.members.set(member.id, memberWithDefaults);
        }

  async getMember(id: string): Promise<Member | undefined> {
    return this.members.get(id);
  }

  async listMembers(): Promise<Member[]> {
    return Array.from(this.members.values());
  }

  async updateMember(id: string, updates: Partial<Member>): Promise<void> {
    const existing = this.members.get(id);
    if (existing) {
      this.members.set(id, { ...existing, ...updates });
    }
  }

  async init(): Promise<void> {
    // No-op for in-memory database
  }

  // PR operations (async for compatibility with PostgreSQL)
  async findPr(repoFullName: string, number: number): Promise<PrRecord | undefined> {
    const key = `${repoFullName}#${number}`;
    return this.prByRepoAndNumber.get(key);
  }

  async upsertPr(pr: PrRecord): Promise<PrRecord> {
    const key = `${pr.repoFullName}#${pr.number}`;
    this.prs.set(pr.id, pr);
    this.prByRepoAndNumber.set(key, pr);
    return pr;
  }

  async updatePr(id: string, updates: Partial<PrRecord>): Promise<void> {
    const existing = this.prs.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.prs.set(id, updated);
      const key = `${updated.repoFullName}#${updated.number}`;
      this.prByRepoAndNumber.set(key, updated);
    }
  }

  async getPr(id: string): Promise<PrRecord | undefined> {
    return this.prs.get(id);
  }

  async listOpenPrs(): Promise<PrRecord[]> {
    return Array.from(this.prs.values()).filter(p => p.status === 'OPEN');
  }

  // Assignment operations (async for compatibility with PostgreSQL)
  async createAssignments(prId: string, memberIds: string[]): Promise<Assignment[]> {
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

  async getAssignmentsForPr(prId: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values()).filter(a => a.prId === prId);
  }

  async getOpenAssignmentsForMember(memberId: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values())
      .filter(a => a.memberId === memberId && !a.completedAt);
  }

  async getOpenAssignmentsCount(memberId: string): Promise<number> {
    const assignments = await this.getOpenAssignmentsForMember(memberId);
    return assignments.length;
  }

  async markAssignmentDone(assignmentId: string): Promise<boolean> {
    const assignment = this.assignments.get(assignmentId);
    if (assignment && !assignment.completedAt) {
      assignment.completedAt = Date.now();
      return true;
    }
    return false;
  }

  async markAssignmentDoneBySlackUser(prId: string, slackUserId: string): Promise<boolean> {
    const assignments = await this.getAssignmentsForPr(prId);
    const assignment = assignments.find(a => a.slackUserId === slackUserId && !a.completedAt);
    if (assignment) {
      return await this.markAssignmentDone(assignment.id);
    }
    return false;
  }

  async getAssignmentsBySlackUser(slackUserId: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values())
      .filter(a => a.slackUserId === slackUserId && !a.completedAt);
  }
}

// Export database instance - will be initialized in index.ts
export let db: MemoryDb | any;

// Factory function to create appropriate database
export function createDb(usePostgres: boolean, connectionString?: string): MemoryDb | any {
  if (usePostgres && connectionString) {
    // Dynamic import to avoid requiring pg if not using database
    const { PostgresDb } = require('./postgresDb');
    return new PostgresDb(connectionString);
  }
  return new MemoryDb();
}

// Default to in-memory for backwards compatibility
db = new MemoryDb();

