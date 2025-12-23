// In-memory database for PRs, members, and assignments
import { logger } from '../utils/logger';

export type Role = 'FE' | 'BE' | 'FS'; // Frontend, Backend, Full Stack
export type PrStatus = 'OPEN' | 'CLOSED' | 'MERGED';
export type PrSize = 'SMALL' | 'MEDIUM' | 'LARGE';
export type Stack = 'FE' | 'BE' | 'MIXED';

export interface Team {
  id: string;
  workspaceId: string; // Workspace this team belongs to
  name: string;
  slackChannelId: string; // Default channel for team notifications
  createdAt: number;
  isActive: boolean;
}

export interface RepoMapping {
  id: string;
  workspaceId: string; // Workspace this mapping belongs to
  teamId: string;
  repoFullName: string; // e.g., "org/repo"
  createdAt: number;
}

export interface Workspace {
  id: string; // Workspace ID (internal)
  slackTeamId: string; // Slack team ID (unique, primary key for lookup)
  name?: string;
  plan: 'free' | 'pro' | 'enterprise';
  defaultChannelId?: string; // Per-workspace default channel (replaces env SLACK_DEFAULT_CHANNEL_ID)
  setupChannelId?: string; // Optional private channel for setup messages (DM if not set)
  installerUserId?: string; // User who installed the app (first admin)
  setupComplete: boolean; // Whether onboarding wizard is complete
  setupStep?: string; // Current step in onboarding: 'channel' | 'github' | 'jira' | 'teams' | 'repos' | 'members' | 'complete'
  goLiveEnabled: boolean; // Whether PR processing is enabled (Go Live toggle)
  polarCustomerId?: string;
  polarSubscriptionId?: string;
  subscriptionStatus: 'active' | 'canceled' | 'revoked' | 'past_due' | 'incomplete' | 'unknown';
  currentPeriodEnd?: number; // Unix timestamp
  githubInstallationId?: string; // GitHub App installation ID
  githubAccount?: string; // GitHub org/user name
  createdAt: number;
  updatedAt: number;
}

export interface JiraConnection {
  id: string;
  workspaceId: string;
  baseUrl: string;
  authType: 'basic' | 'oauth';
  tokenEncrypted: string; // Encrypted API token
  email: string;
  prOpenedTransition?: string; // Transition name when PR is opened
  prMergedTransition?: string; // Transition name when PR is merged
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceSettings {
  slackTeamId: string; // Primary key
  defaultChannelId?: string;
  githubInstallationId?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  jiraApiTokenEncrypted?: string;
  requiredReviewers?: number;
  reminderHours?: number;
  reminderEscalationHours?: number;
  createdAt: number;
  updatedAt: number;
}

export interface SlackInstallation {
  teamId: string; // Primary key
  botToken: string; // Encrypted
  botId?: string;
  botUserId?: string;
  installerUserId?: string;
  teamName?: string;
  installedAt: number;
  updatedAt: number;
}

export interface Member {
  id: string;
  workspaceId: string; // Workspace this member belongs to
  slackUserId: string;
  githubUsernames: string[];
  roles: Role[];
  weight: number; // 0.0 to 1.0, affects assignment priority
  isActive: boolean;
  isUnavailable: boolean; // true if sick, on vacation, etc.
  teamId?: string; // Optional: associate member with a team
}

export interface PrRecord {
  id: string;
  workspaceId: string; // Workspace this PR belongs to
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
  teamId?: string; // Optional: associate PR with a team
  // Enhanced metadata
  additions?: number;
  deletions?: number;
  changedFiles?: number;
  totalChanges?: number;
}

export type AssignmentStatus = 'ASSIGNED' | 'IN_PROGRESS' | 'DONE';

export interface Assignment {
  id: string;
  prId: string;
  memberId: string;
  createdAt: number;
  completedAt?: number;
  status: AssignmentStatus;
  slackUserId?: string; // for quick lookup
}

// Define a common interface for database operations
export interface IDatabase {
  init(): Promise<void>;
  
  // Workspace operations
  addWorkspace(workspace: Workspace): Promise<void>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceBySlackTeamId(slackTeamId: string): Promise<Workspace | undefined>;
  getWorkspaceByGitHubInstallation(installationId: string): Promise<Workspace | undefined>;
  listWorkspaces(): Promise<Workspace[]>;
  upsertWorkspace(workspace: Workspace): Promise<void>;
  updateWorkspace(id: string, updates: Partial<Workspace>): Promise<void>;
  updateWorkspacePlan(slackTeamId: string, plan: 'free' | 'pro' | 'enterprise', status: 'active' | 'canceled' | 'revoked' | 'past_due' | 'incomplete' | 'unknown', subscriptionId?: string, customerId?: string, periodEnd?: number): Promise<void>;
  
  // Subscription operations
  upsertSubscription(subscription: any): Promise<void>;
  getSubscription(workspaceId: string): Promise<any | undefined>;
  updateSubscription(workspaceId: string, updates: Partial<any>): Promise<void>;
  
  // Usage tracking
  incrementUsage(workspaceId: string, month: string): Promise<void>;
  getUsage(workspaceId: string, month: string): Promise<any | undefined>;
  resetUsage(workspaceId: string, month: string): Promise<void>;
  
  // Audit logs
  addAuditLog(log: any): Promise<void>;
  listAuditLogs(workspaceId: string, limit?: number): Promise<any[]>;
  
  // Webhook idempotency (prevent duplicate processing)
  getWebhookDelivery(deliveryId: string): Promise<any | undefined>;
  saveWebhookDelivery(deliveryId: string, workspaceId: string, event: string): Promise<void>;
  
  // Workspace settings operations
  getWorkspaceSettings(slackTeamId: string): Promise<WorkspaceSettings | undefined>;
  upsertWorkspaceSettings(settings: WorkspaceSettings): Promise<void>;
  
  // Slack installation operations (for OAuth)
  getSlackInstallation(teamId: string): Promise<SlackInstallation | undefined>;
  upsertSlackInstallation(installation: SlackInstallation): Promise<void>;
  deleteSlackInstallation(teamId: string): Promise<void>;
  
  // Member operations
  addMember(member: Member): Promise<void>;
  getMember(id: string): Promise<Member | undefined>;
  listMembers(workspaceId: string, teamId?: string): Promise<Member[]>;
  updateMember(id: string, updates: Partial<Member>): Promise<void>;
  removeMember(id: string): Promise<void>;
  
  // Team operations
  addTeam(team: Team): Promise<void>;
  getTeam(id: string): Promise<Team | undefined>;
  listTeams(workspaceId: string): Promise<Team[]>;
  updateTeam(id: string, updates: Partial<Team>): Promise<void>;
  removeTeam(id: string): Promise<void>;
  
  // Repo mapping operations
  addRepoMapping(mapping: RepoMapping): Promise<void>;
  getRepoMapping(workspaceId: string, repoFullName: string): Promise<RepoMapping | undefined>;
  listRepoMappings(workspaceId: string, teamId?: string): Promise<RepoMapping[]>;
  removeRepoMapping(id: string): Promise<void>;
  
  // PR operations
  findPr(workspaceId: string, repoFullName: string, number: number): Promise<PrRecord | undefined>;
  upsertPr(pr: PrRecord): Promise<PrRecord>;
  updatePr(id: string, updates: Partial<PrRecord>): Promise<void>;
  getPr(id: string): Promise<PrRecord | undefined>;
  listOpenPrs(teamId?: string): Promise<PrRecord[]>;
  
  // Assignment operations
  createAssignments(prId: string, memberIds: string[]): Promise<Assignment[]>;
  getAssignmentsForPr(prId: string): Promise<Assignment[]>;
  getOpenAssignmentsForMember(memberId: string): Promise<Assignment[]>;
  getOpenAssignmentsCount(memberId: string): Promise<number>;
  markAssignmentDone(assignmentId: string): Promise<boolean>;
  markAssignmentDoneBySlackUser(prId: string, slackUserId: string): Promise<boolean>;
  getAssignmentsBySlackUser(slackUserId: string): Promise<Assignment[]>;
  updateAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<boolean>;
}

class MemoryDb implements IDatabase {
  private workspaces: Map<string, Workspace> = new Map();
  private subscriptions: Map<string, any> = new Map(); // key: workspaceId
  private usage: Map<string, any> = new Map(); // key: workspaceId:month
  private auditLogs: Array<any> = [];
  private jiraConnections: Map<string, JiraConnection> = new Map(); // key: workspaceId
  private workspaceSettings: Map<string, WorkspaceSettings> = new Map(); // key: slackTeamId
  private slackInstallations: Map<string, SlackInstallation> = new Map(); // key: teamId
  private webhookDeliveries: Map<string, any> = new Map(); // key: deliveryId (for idempotency)
  private members: Map<string, Member> = new Map();
  private teams: Map<string, Team> = new Map();
  private repoMappings: Map<string, RepoMapping> = new Map(); // key: workspaceId:repoFullName
  private prs: Map<string, PrRecord> = new Map();
  private assignments: Map<string, Assignment> = new Map();
  private prByRepoAndNumber: Map<string, PrRecord> = new Map(); // key: "workspaceId:repo/number"

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

  async listMembers(workspaceId: string, teamId?: string): Promise<Member[]> {
    const all = Array.from(this.members.values()).filter(m => m.workspaceId === workspaceId);
    if (teamId) {
      return all.filter(m => m.teamId === teamId);
    }
    return all;
  }

  async updateMember(id: string, updates: Partial<Member>): Promise<void> {
    const existing = this.members.get(id);
    if (existing) {
      this.members.set(id, { ...existing, ...updates });
    }
  }

  async removeMember(id: string): Promise<void> {
    this.members.delete(id);
    // Also remove assignments related to this member
    this.assignments = new Map(Array.from(this.assignments.entries()).filter(([, a]) => a.memberId !== id));
  }

  async init(): Promise<void> {
    // No-op for in-memory database
  }

  // Workspace operations
  async addWorkspace(workspace: Workspace): Promise<void> {
    this.workspaces.set(workspace.id, workspace);
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async getWorkspaceBySlackTeamId(slackTeamId: string): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(w => w.slackTeamId === slackTeamId);
  }

  async getWorkspaceByGitHubInstallation(installationId: string): Promise<Workspace | undefined> {
    return Array.from(this.workspaces.values()).find(w => w.githubInstallationId === installationId);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return Array.from(this.workspaces.values());
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    const existing = Array.from(this.workspaces.values()).find(w => w.slackTeamId === workspace.slackTeamId);
    if (existing) {
      this.workspaces.set(existing.id, { ...existing, ...workspace, updatedAt: Date.now() });
    } else {
      this.workspaces.set(workspace.id, workspace);
    }
  }

  async updateWorkspace(id: string, updates: Partial<Workspace>): Promise<void> {
    const existing = this.workspaces.get(id);
    if (existing) {
      this.workspaces.set(id, { ...existing, ...updates, updatedAt: Date.now() });
    }
  }

  async updateWorkspacePlan(
    slackTeamId: string,
    plan: 'free' | 'pro' | 'enterprise',
    status: 'active' | 'canceled' | 'revoked' | 'past_due' | 'incomplete' | 'unknown',
    subscriptionId?: string,
    customerId?: string,
    periodEnd?: number
  ): Promise<void> {
    const workspace = await this.getWorkspaceBySlackTeamId(slackTeamId);
    if (workspace) {
      await this.updateWorkspace(workspace.id, {
        plan,
        subscriptionStatus: status,
        polarSubscriptionId: subscriptionId,
        polarCustomerId: customerId,
        currentPeriodEnd: periodEnd,
        updatedAt: Date.now()
      });
    } else {
      // Create new workspace
      const newWorkspace: Workspace = {
        id: `workspace_${slackTeamId}`,
        slackTeamId,
        plan,
        subscriptionStatus: status,
        setupComplete: false,
        setupStep: 'channel',
        goLiveEnabled: false,
        polarSubscriptionId: subscriptionId,
        polarCustomerId: customerId,
        currentPeriodEnd: periodEnd,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await this.addWorkspace(newWorkspace);
    }
  }

  // Subscription operations
  async upsertSubscription(subscription: any): Promise<void> {
    this.subscriptions.set(subscription.workspaceId, {
      ...subscription,
      updatedAt: Date.now()
    });
  }

  async getSubscription(workspaceId: string): Promise<any | undefined> {
    return this.subscriptions.get(workspaceId);
  }

  async updateSubscription(workspaceId: string, updates: Partial<any>): Promise<void> {
    const existing = this.subscriptions.get(workspaceId);
    if (existing) {
      this.subscriptions.set(workspaceId, {
        ...existing,
        ...updates,
        updatedAt: Date.now()
      });
    }
  }

  // Usage tracking
  async incrementUsage(workspaceId: string, month: string): Promise<void> {
    const key = `${workspaceId}:${month}`;
    const existing = this.usage.get(key);
    if (existing) {
      existing.prsProcessed += 1;
      this.usage.set(key, existing);
    } else {
      this.usage.set(key, {
        workspaceId,
        month,
        prsProcessed: 1,
        limit: 50, // Default free limit
        resetAt: new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1)
      });
    }
  }

  async getUsage(workspaceId: string, month: string): Promise<any | undefined> {
    const key = `${workspaceId}:${month}`;
    return this.usage.get(key);
  }

  async resetUsage(workspaceId: string, month: string): Promise<void> {
    const key = `${workspaceId}:${month}`;
    this.usage.delete(key);
  }

  // Audit logs
  async addAuditLog(log: any): Promise<void> {
    this.auditLogs.push({
      ...log,
      timestamp: Date.now()
    });
    // Keep only last 10000 logs in memory
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-10000);
    }
  }

  async listAuditLogs(workspaceId: string, limit: number = 100): Promise<any[]> {
    return this.auditLogs
      .filter(log => log.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // Webhook idempotency
  async getWebhookDelivery(deliveryId: string): Promise<any | undefined> {
    return this.webhookDeliveries.get(deliveryId);
  }

  async saveWebhookDelivery(deliveryId: string, workspaceId: string, event: string): Promise<void> {
    this.webhookDeliveries.set(deliveryId, {
      deliveryId,
      workspaceId,
      event,
      processedAt: Date.now()
    });
    // Keep only last 10000 deliveries in memory
    if (this.webhookDeliveries.size > 10000) {
      const entries = Array.from(this.webhookDeliveries.entries());
      const toKeep = entries.slice(-10000);
      this.webhookDeliveries.clear();
      for (const [key, value] of toKeep) {
        this.webhookDeliveries.set(key, value);
      }
    }
  }

  async addAuditLogLegacy(log: any): Promise<void> {
    // Legacy method name for backward compatibility
    return this.addAuditLog(log);
    if (this.auditLogs.length > 10000) {
      this.auditLogs = this.auditLogs.slice(-10000);
    }
  }

  // PR operations (async for compatibility with PostgreSQL)
  async findPr(workspaceId: string, repoFullName: string, number: number): Promise<PrRecord | undefined> {
    if (!workspaceId) {
      throw new Error('workspaceId is required');
    }
    const key = `${workspaceId}:${repoFullName}#${number}`;
    return this.prByRepoAndNumber.get(key);
  }

  async upsertPr(pr: PrRecord): Promise<PrRecord> {
    if (!pr.workspaceId) {
      throw new Error('workspaceId is required for PR');
    }
    const key = `${pr.workspaceId}:${pr.repoFullName}#${pr.number}`;
    this.prs.set(pr.id, pr);
    this.prByRepoAndNumber.set(key, pr);
    return pr;
  }

  async updatePr(id: string, updates: Partial<PrRecord>): Promise<void> {
    const existing = this.prs.get(id);
    if (existing) {
      const updated = { ...existing, ...updates };
      this.prs.set(id, updated);
      const key = `${updated.workspaceId}:${updated.repoFullName}#${updated.number}`;
      this.prByRepoAndNumber.set(key, updated);
    }
  }

  async getPr(id: string): Promise<PrRecord | undefined> {
    return this.prs.get(id);
  }

  async listOpenPrs(workspaceId: string, teamId?: string): Promise<PrRecord[]> {
    const all = Array.from(this.prs.values()).filter(p => p.workspaceId === workspaceId && p.status === 'OPEN');
    if (teamId) {
      return all.filter(p => p.teamId === teamId);
    }
    return all;
  }

  // Team operations
  async addTeam(team: Team): Promise<void> {
    this.teams.set(team.id, team);
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async listTeams(workspaceId: string): Promise<Team[]> {
    return Array.from(this.teams.values()).filter(t => t.workspaceId === workspaceId);
  }

  async updateTeam(id: string, updates: Partial<Team>): Promise<void> {
    const existing = this.teams.get(id);
    if (existing) {
      this.teams.set(id, { ...existing, ...updates });
    }
  }

  async removeTeam(id: string): Promise<void> {
    this.teams.delete(id);
    // Optionally remove team members and repo mappings
    // For now, we'll leave them orphaned (teamId will be undefined)
  }

  // Repo mapping operations
  async addRepoMapping(mapping: RepoMapping): Promise<void> {
    const key = `${mapping.workspaceId}:${mapping.repoFullName}`;
    this.repoMappings.set(key, mapping);
  }

  async getRepoMapping(workspaceId: string, repoFullName: string): Promise<RepoMapping | undefined> {
    const key = `${workspaceId}:${repoFullName}`;
    return this.repoMappings.get(key);
  }

  async listRepoMappings(workspaceId: string, teamId?: string): Promise<RepoMapping[]> {
    const all = Array.from(this.repoMappings.values()).filter(m => m.workspaceId === workspaceId);
    if (teamId) {
      return all.filter(m => m.teamId === teamId);
    }
    return all;
  }

  async removeRepoMapping(id: string): Promise<void> {
    const mapping = Array.from(this.repoMappings.values()).find(m => m.id === id);
    if (mapping) {
      const key = `${mapping.workspaceId}:${mapping.repoFullName}`;
      this.repoMappings.delete(key);
    }
  }

  // Assignment operations (async for compatibility with PostgreSQL)
  async createAssignments(prId: string, memberIds: string[]): Promise<Assignment[]> {
    const assignments: Assignment[] = [];
    const pr = this.prs.get(prId);
    if (!pr) return assignments;
    
    if (!pr.workspaceId) {
      throw new Error('PR must have workspaceId');
    }

    for (const memberId of memberIds) {
      const member = this.members.get(memberId);
      if (!member) continue;
      
      // Ensure member is in same workspace
      if (member.workspaceId !== pr.workspaceId) {
        continue; // Skip members from different workspaces
      }

      const assignment: Assignment = {
        id: `assign_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        prId,
        memberId,
        createdAt: Date.now(),
        status: 'ASSIGNED', // Default status
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
    if (assignment && assignment.status !== 'DONE') {
      assignment.completedAt = Date.now();
      assignment.status = 'DONE';
      return true;
    }
    return false;
  }

  async updateAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<boolean> {
    const assignment = this.assignments.get(assignmentId);
    if (assignment) {
      assignment.status = status;
      if (status === 'DONE' && !assignment.completedAt) {
        assignment.completedAt = Date.now();
      }
      return true;
    }
    return false;
  }

  async markAssignmentDoneBySlackUser(prId: string, slackUserId: string): Promise<boolean> {
    const assignments = await this.getAssignmentsForPr(prId);
    const assignment = assignments.find(a => a.slackUserId === slackUserId && a.status !== 'DONE');
    if (assignment) {
      return await this.markAssignmentDone(assignment.id);
    }
    return false;
  }

  async getAssignmentsBySlackUser(slackUserId: string): Promise<Assignment[]> {
    return Array.from(this.assignments.values())
      .filter(a => a.slackUserId === slackUserId && a.status !== 'DONE');
  }

  // Workspace settings operations
  async getWorkspaceSettings(slackTeamId: string): Promise<WorkspaceSettings | undefined> {
    return this.workspaceSettings.get(slackTeamId);
  }

  async upsertWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
    this.workspaceSettings.set(settings.slackTeamId, {
      ...settings,
      updatedAt: Date.now()
    });
  }

  // Slack installation operations (for OAuth)
  async getSlackInstallation(teamId: string): Promise<SlackInstallation | undefined> {
    return this.slackInstallations.get(teamId);
  }

  async upsertSlackInstallation(installation: SlackInstallation): Promise<void> {
    this.slackInstallations.set(installation.teamId, {
      ...installation,
      updatedAt: Date.now()
    });
  }

  async deleteSlackInstallation(teamId: string): Promise<void> {
    this.slackInstallations.delete(teamId);
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

/**
 * Set the database instance (dependency injection)
 * Called from src/index.ts after DB initialization
 */
export function setDb(dbInstance: IDatabase): void {
  db = dbInstance;
  logger.info('Database instance set', { 
    type: dbInstance instanceof MemoryDb ? 'memory' : 'postgres' 
  });
}

/**
 * Get the current database instance
 */
export function getDb(): IDatabase {
  if (!db) {
    logger.warn('Database instance not set, using default in-memory DB');
    db = new MemoryDb();
  }
  return db;
}

