// PostgreSQL database implementation
import { Pool, QueryResult } from 'pg';
import { Member, PrRecord, Assignment, Role, PrStatus, PrSize, Stack, AssignmentStatus } from './memoryDb';

export class PostgresDb {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('railway') || connectionString.includes('render') 
        ? { rejectUnauthorized: false } 
        : false
    });
  }

  async init(): Promise<void> {
    // Create tables if they don't exist
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS members (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL,
        slack_user_id VARCHAR(255) NOT NULL,
        github_usernames TEXT[] NOT NULL,
        roles TEXT[] NOT NULL,
        weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_unavailable BOOLEAN NOT NULL DEFAULT false,
        team_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(workspace_id, slack_user_id)
      );
      
      -- Migration: Add workspace_id and team_id if they don't exist
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'members' AND column_name = 'workspace_id'
        ) THEN
          ALTER TABLE members ADD COLUMN workspace_id VARCHAR(255);
          ALTER TABLE members ADD COLUMN team_id VARCHAR(255);
          -- Backfill: Set workspace_id to a default (will need manual fix for production)
          UPDATE members SET workspace_id = 'default_workspace' WHERE workspace_id IS NULL;
          ALTER TABLE members ALTER COLUMN workspace_id SET NOT NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'members' AND column_name = 'is_unavailable'
        ) THEN
          ALTER TABLE members ADD COLUMN is_unavailable BOOLEAN NOT NULL DEFAULT false;
        END IF;
        -- Drop old unique constraint if exists and add new composite unique
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE table_name = 'members' AND constraint_name = 'members_slack_user_id_key'
        ) THEN
          ALTER TABLE members DROP CONSTRAINT members_slack_user_id_key;
        END IF;
      END $$;
      
      -- Create composite unique index if it doesn't exist
      CREATE UNIQUE INDEX IF NOT EXISTS idx_members_workspace_slack_user 
        ON members(workspace_id, slack_user_id);

      CREATE TABLE IF NOT EXISTS prs (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL,
        repo_full_name VARCHAR(255) NOT NULL,
        number INTEGER NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        author_github VARCHAR(255) NOT NULL,
        created_at BIGINT NOT NULL,
        status VARCHAR(20) NOT NULL,
        size VARCHAR(20) NOT NULL,
        stack VARCHAR(20) NOT NULL,
        jira_issue_key VARCHAR(255),
        slack_channel_id VARCHAR(255) NOT NULL,
        slack_message_ts VARCHAR(255),
        team_id VARCHAR(255),
        additions INTEGER,
        deletions INTEGER,
        changed_files INTEGER,
        total_changes INTEGER,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(workspace_id, repo_full_name, number)
      );
      
      -- Migration: Add workspace_id and team_id if they don't exist
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'prs' AND column_name = 'workspace_id'
        ) THEN
          ALTER TABLE prs ADD COLUMN workspace_id VARCHAR(255);
          ALTER TABLE prs ADD COLUMN team_id VARCHAR(255);
          -- Backfill: Set workspace_id to a default (will need manual fix for production)
          UPDATE prs SET workspace_id = 'default_workspace' WHERE workspace_id IS NULL;
          ALTER TABLE prs ALTER COLUMN workspace_id SET NOT NULL;
          -- Drop old unique constraint if exists
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_name = 'prs' AND constraint_name = 'prs_repo_full_name_number_key'
          ) THEN
            ALTER TABLE prs DROP CONSTRAINT prs_repo_full_name_number_key;
          END IF;
        END IF;
      END $$;
      
      -- Create composite unique index
      CREATE UNIQUE INDEX IF NOT EXISTS idx_prs_workspace_repo_number 
        ON prs(workspace_id, repo_full_name, number);
      
      -- Add metadata columns if they don't exist (for existing databases)
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'prs' AND column_name = 'additions'
        ) THEN
          ALTER TABLE prs ADD COLUMN additions INTEGER;
          ALTER TABLE prs ADD COLUMN deletions INTEGER;
          ALTER TABLE prs ADD COLUMN changed_files INTEGER;
          ALTER TABLE prs ADD COLUMN total_changes INTEGER;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS assignments (
        id VARCHAR(255) PRIMARY KEY,
        pr_id VARCHAR(255) NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
        member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        completed_at BIGINT,
        status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',
        slack_user_id VARCHAR(255),
        created_at_ts TIMESTAMP DEFAULT NOW()
      );
      
      -- Add status column if it doesn't exist (for existing databases)
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'assignments' AND column_name = 'status'
        ) THEN
          ALTER TABLE assignments ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED';
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_assignments_pr_id ON assignments(pr_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_member_id ON assignments(member_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_slack_user_id ON assignments(slack_user_id);
      CREATE INDEX IF NOT EXISTS idx_prs_repo_number ON prs(repo_full_name, number);

      -- Workspaces table
      CREATE TABLE IF NOT EXISTS workspaces (
        id VARCHAR(255) PRIMARY KEY,
        slack_team_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        plan VARCHAR(20) NOT NULL DEFAULT 'free',
        default_channel_id VARCHAR(255),
        setup_channel_id VARCHAR(255),
        installer_user_id VARCHAR(255),
        setup_complete BOOLEAN NOT NULL DEFAULT false,
        setup_step VARCHAR(50),
        go_live_enabled BOOLEAN NOT NULL DEFAULT false,
        polar_customer_id VARCHAR(255),
        polar_subscription_id VARCHAR(255),
        subscription_status VARCHAR(20) NOT NULL DEFAULT 'active',
        current_period_end BIGINT,
        github_installation_id VARCHAR(255),
        github_account VARCHAR(255),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      );
      
      -- Migration: Add go_live_enabled if it doesn't exist
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'workspaces' AND column_name = 'go_live_enabled'
        ) THEN
          ALTER TABLE workspaces ADD COLUMN go_live_enabled BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_workspaces_slack_team_id ON workspaces(slack_team_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_github_installation ON workspaces(github_installation_id);

      -- Workspace settings table (per-workspace configuration)
      CREATE TABLE IF NOT EXISTS workspace_settings (
        slack_team_id VARCHAR(255) PRIMARY KEY REFERENCES workspaces(slack_team_id) ON DELETE CASCADE,
        default_channel_id VARCHAR(255),
        github_installation_id VARCHAR(255),
        jira_base_url VARCHAR(255),
        jira_email VARCHAR(255),
        jira_api_token_encrypted TEXT,
        required_reviewers INTEGER DEFAULT 2,
        reminder_hours INTEGER DEFAULT 24,
        reminder_escalation_hours INTEGER DEFAULT 48,
        fe_labels VARCHAR(500),
        be_labels VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Migration: Add fe_labels and be_labels columns if they don't exist
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'workspace_settings' AND column_name = 'fe_labels'
        ) THEN
          ALTER TABLE workspace_settings ADD COLUMN fe_labels VARCHAR(500);
          ALTER TABLE workspace_settings ADD COLUMN be_labels VARCHAR(500);
        END IF;
      END $$;

      -- Jira connections table
      CREATE TABLE IF NOT EXISTS jira_connections (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        base_url VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        api_token TEXT NOT NULL,
        pr_opened_transition VARCHAR(255),
        pr_merged_transition VARCHAR(255),
        created_at BIGINT NOT NULL,
        updated_at BIGINT NOT NULL,
        UNIQUE(workspace_id)
      );
      
      -- Add transition columns if they don't exist (migration)
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jira_connections' AND column_name = 'pr_opened_transition') THEN
          ALTER TABLE jira_connections ADD COLUMN pr_opened_transition VARCHAR(255);
          ALTER TABLE jira_connections ADD COLUMN pr_merged_transition VARCHAR(255);
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_jira_connections_workspace_id ON jira_connections(workspace_id);

      -- Slack installations table (for OAuth)
      CREATE TABLE IF NOT EXISTS slack_installations (
        team_id VARCHAR(255) PRIMARY KEY,
        bot_token TEXT NOT NULL,
        bot_id VARCHAR(255),
        bot_user_id VARCHAR(255),
        installer_user_id VARCHAR(255),
        team_name VARCHAR(255),
        installed_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_slack_installations_team_id ON slack_installations(team_id);

      -- Usage tracking table
      CREATE TABLE IF NOT EXISTS usage (
        workspace_id VARCHAR(255) NOT NULL,
        month VARCHAR(7) NOT NULL,
        prs_processed INTEGER NOT NULL DEFAULT 0,
        limit_value INTEGER NOT NULL,
        reset_at BIGINT NOT NULL,
        PRIMARY KEY (workspace_id, month)
      );

      -- Audit logs table
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL,
        event VARCHAR(50) NOT NULL,
        metadata JSONB,
        timestamp BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_id ON audit_logs(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);

      -- Teams table
      CREATE TABLE IF NOT EXISTS teams (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        slack_channel_id VARCHAR(255),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_teams_workspace_id ON teams(workspace_id);

      -- Repo mappings table
      CREATE TABLE IF NOT EXISTS repo_mappings (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        team_id VARCHAR(255) REFERENCES teams(id) ON DELETE SET NULL,
        repo_full_name VARCHAR(255) NOT NULL,
        required_reviewers INTEGER DEFAULT 2,
        stack_rules JSONB,
        created_at BIGINT NOT NULL,
        UNIQUE(workspace_id, repo_full_name)
      );
      
      -- Migration: Add new columns if they don't exist
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'repo_mappings' AND column_name = 'required_reviewers'
        ) THEN
          ALTER TABLE repo_mappings ADD COLUMN required_reviewers INTEGER DEFAULT 2;
          ALTER TABLE repo_mappings ADD COLUMN stack_rules JSONB;
        END IF;
      END $$;
      
      CREATE INDEX IF NOT EXISTS idx_repo_mappings_workspace_id ON repo_mappings(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_repo_mappings_repo_full_name ON repo_mappings(repo_full_name);

      -- Add workspace_id to existing tables if not present
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'workspace_id') THEN
          ALTER TABLE members ADD COLUMN workspace_id VARCHAR(255);
          ALTER TABLE members ADD COLUMN team_id VARCHAR(255);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prs' AND column_name = 'workspace_id') THEN
          ALTER TABLE prs ADD COLUMN workspace_id VARCHAR(255);
          ALTER TABLE prs ADD COLUMN team_id VARCHAR(255);
        END IF;
      END $$;
    `);
  }

  // Member operations
  async addMember(member: Member): Promise<void> {
    await this.pool.query(
      `INSERT INTO members (id, slack_user_id, github_usernames, roles, weight, is_active, is_unavailable)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         github_usernames = $3,
         roles = $4,
         weight = $5,
         is_active = $6,
         is_unavailable = $7,
         updated_at = NOW()`,
      [member.id, member.slackUserId, member.githubUsernames, member.roles, member.weight, member.isActive, member.isUnavailable ?? false]
    );
  }

  async getMember(id: string): Promise<Member | undefined> {
    const result = await this.pool.query('SELECT * FROM members WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToMember(result.rows[0]);
  }

  async listMembers(workspaceId: string, teamId?: string): Promise<Member[]> {
    if (teamId) {
      const result = await this.pool.query(
        'SELECT * FROM members WHERE workspace_id = $1 AND team_id = $2 ORDER BY created_at',
        [workspaceId, teamId]
      );
      return result.rows.map(row => this.rowToMember(row));
    } else {
      const result = await this.pool.query(
        'SELECT * FROM members WHERE workspace_id = $1 ORDER BY created_at',
        [workspaceId]
      );
      return result.rows.map(row => this.rowToMember(row));
    }
  }


  async updateMember(id: string, updates: Partial<Member>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.githubUsernames !== undefined) {
      fields.push(`github_usernames = $${paramCount++}`);
      values.push(updates.githubUsernames);
    }
    if (updates.roles !== undefined) {
      fields.push(`roles = $${paramCount++}`);
      values.push(updates.roles);
    }
    if (updates.weight !== undefined) {
      fields.push(`weight = $${paramCount++}`);
      values.push(updates.weight);
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(updates.isActive);
    }
    if (updates.isUnavailable !== undefined) {
      fields.push(`is_unavailable = $${paramCount++}`);
      values.push(updates.isUnavailable);
    }

    if (fields.length === 0) return;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE members SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  // PR operations
  async findPr(workspaceId: string, repoFullName: string, number: number): Promise<PrRecord | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM prs WHERE workspace_id = $1 AND repo_full_name = $2 AND number = $3',
      [workspaceId, repoFullName, number]
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToPr(result.rows[0]);
  }

  async upsertPr(pr: PrRecord): Promise<PrRecord> {
    await this.pool.query(
      `INSERT INTO prs (id, repo_full_name, number, title, url, author_github, created_at, status, size, stack, jira_issue_key, slack_channel_id, slack_message_ts, additions, deletions, changed_files, total_changes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (repo_full_name, number) DO UPDATE SET
         title = $4,
         url = $5,
         status = $8,
         size = $9,
         stack = $10,
         jira_issue_key = $11,
         slack_channel_id = $12,
         slack_message_ts = $13,
         additions = $14,
         deletions = $15,
         changed_files = $16,
         total_changes = $17,
         updated_at = NOW()`,
      [
        pr.id, pr.repoFullName, pr.number, pr.title, pr.url, pr.authorGithub, pr.createdAt,
        pr.status, pr.size, pr.stack, pr.jiraIssueKey || null, pr.slackChannelId, pr.slackMessageTs || null,
        pr.additions || null, pr.deletions || null, pr.changedFiles || null, pr.totalChanges || null
      ]
    );
    return pr;
  }

  async updatePr(id: string, updates: Partial<PrRecord>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(updates.status);
    }
    if (updates.slackMessageTs !== undefined) {
      fields.push(`slack_message_ts = $${paramCount++}`);
      values.push(updates.slackMessageTs);
    }
    if (updates.slackChannelId !== undefined) {
      fields.push(`slack_channel_id = $${paramCount++}`);
      values.push(updates.slackChannelId);
    }
    if (updates.jiraIssueKey !== undefined) {
      fields.push(`jira_issue_key = $${paramCount++}`);
      values.push(updates.jiraIssueKey);
    }

    if (fields.length === 0) return;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.pool.query(
      `UPDATE prs SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  async getPr(id: string): Promise<PrRecord | undefined> {
    const result = await this.pool.query('SELECT * FROM prs WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToPr(result.rows[0]);
  }

  async listOpenPrs(workspaceId: string, teamId?: string): Promise<PrRecord[]> {
    if (teamId) {
      const result = await this.pool.query(
        "SELECT * FROM prs WHERE workspace_id = $1 AND team_id = $2 AND status = 'OPEN' ORDER BY created_at DESC",
        [workspaceId, teamId]
      );
      return result.rows.map(row => this.rowToPr(row));
    } else {
      const result = await this.pool.query(
        "SELECT * FROM prs WHERE workspace_id = $1 AND status = 'OPEN' ORDER BY created_at DESC",
        [workspaceId]
      );
      return result.rows.map(row => this.rowToPr(row));
    }
  }

  // Assignment operations
  async createAssignments(prId: string, memberIds: string[]): Promise<Assignment[]> {
    const assignments: Assignment[] = [];
    
    for (const memberId of memberIds) {
      const member = await this.getMember(memberId);
      if (!member) continue;

      const assignment: Assignment = {
        id: `assign_${Date.now()}_${Math.random().toString(16).slice(2)}`,
        prId,
        memberId,
        createdAt: Date.now(),
        status: 'ASSIGNED',
        slackUserId: member.slackUserId
      };

      await this.pool.query(
        'INSERT INTO assignments (id, pr_id, member_id, created_at, status, slack_user_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [assignment.id, assignment.prId, assignment.memberId, assignment.createdAt, assignment.status, assignment.slackUserId]
      );

      assignments.push(assignment);
    }
    return assignments;
  }

  async getAssignmentsForPr(prId: string): Promise<Assignment[]> {
    const result = await this.pool.query('SELECT * FROM assignments WHERE pr_id = $1', [prId]);
    return result.rows.map(row => this.rowToAssignment(row));
  }

  async getOpenAssignmentsForMember(memberId: string): Promise<Assignment[]> {
    const result = await this.pool.query(
      'SELECT * FROM assignments WHERE member_id = $1 AND completed_at IS NULL',
      [memberId]
    );
    return result.rows.map(row => this.rowToAssignment(row));
  }

  async getOpenAssignmentsCount(memberId: string): Promise<number> {
    const result = await this.pool.query(
      'SELECT COUNT(*) as count FROM assignments WHERE member_id = $1 AND completed_at IS NULL',
      [memberId]
    );
    return parseInt(result.rows[0].count, 10);
  }

  async markAssignmentDone(assignmentId: string): Promise<boolean> {
    const result = await this.pool.query(
      'UPDATE assignments SET completed_at = $1, status = $2 WHERE id = $3 AND status != $2',
      [Date.now(), 'DONE', assignmentId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async updateAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<boolean> {
    const updates: string[] = ['status = $1'];
    const values: any[] = [status];
    
    if (status === 'DONE') {
      updates.push('completed_at = $2');
      values.push(Date.now());
    }
    
    values.push(assignmentId);
    
    const result = await this.pool.query(
      `UPDATE assignments SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async markAssignmentDoneBySlackUser(prId: string, slackUserId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE assignments SET completed_at = $1 
       WHERE pr_id = $2 AND slack_user_id = $3 AND completed_at IS NULL`,
      [Date.now(), prId, slackUserId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getAssignmentsBySlackUser(slackUserId: string): Promise<Assignment[]> {
    const result = await this.pool.query(
      'SELECT * FROM assignments WHERE slack_user_id = $1 AND completed_at IS NULL',
      [slackUserId]
    );
    return result.rows.map(row => this.rowToAssignment(row));
  }

  // Helper methods
  private rowToMember(row: any): Member {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      slackUserId: row.slack_user_id,
      githubUsernames: row.github_usernames || [],
      roles: row.roles || [],
      weight: parseFloat(row.weight) || 1.0,
      isActive: row.is_active !== false,
      isUnavailable: row.is_unavailable === true,
      teamId: row.team_id || undefined
    };
  }

  private rowToPr(row: any): PrRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      repoFullName: row.repo_full_name,
      number: row.number,
      title: row.title,
      url: row.url,
      authorGithub: row.author_github,
      createdAt: row.created_at,
      status: row.status as PrStatus,
      size: row.size as PrSize,
      stack: row.stack as Stack,
      jiraIssueKey: row.jira_issue_key || undefined,
      slackChannelId: row.slack_channel_id,
      slackMessageTs: row.slack_message_ts || undefined,
      additions: row.additions || undefined,
      deletions: row.deletions || undefined,
      changedFiles: row.changed_files || undefined,
      totalChanges: row.total_changes || undefined
    };
  }

  private rowToAssignment(row: any): Assignment {
    return {
      id: row.id,
      prId: row.pr_id,
      memberId: row.member_id,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
      status: (row.status || 'ASSIGNED') as AssignmentStatus,
      slackUserId: row.slack_user_id || undefined
    };
  }

  // Workspace settings operations
  async getWorkspaceSettings(slackTeamId: string): Promise<any | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM workspace_settings WHERE slack_team_id = $1',
      [slackTeamId]
    );
    return result.rows[0] ? this.mapRowToWorkspaceSettings(result.rows[0]) : undefined;
  }

  async upsertWorkspaceSettings(settings: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO workspace_settings (slack_team_id, default_channel_id, github_installation_id, jira_base_url, jira_email, jira_api_token_encrypted, required_reviewers, reminder_hours, reminder_escalation_hours, fe_labels, be_labels, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
       ON CONFLICT (slack_team_id) DO UPDATE SET
         default_channel_id = EXCLUDED.default_channel_id,
         github_installation_id = EXCLUDED.github_installation_id,
         jira_base_url = EXCLUDED.jira_base_url,
         jira_email = EXCLUDED.jira_email,
         jira_api_token_encrypted = EXCLUDED.jira_api_token_encrypted,
         required_reviewers = EXCLUDED.required_reviewers,
         reminder_hours = EXCLUDED.reminder_hours,
         reminder_escalation_hours = EXCLUDED.reminder_escalation_hours,
         fe_labels = EXCLUDED.fe_labels,
         be_labels = EXCLUDED.be_labels,
         updated_at = NOW()`,
      [
        settings.slackTeamId,
        settings.defaultChannelId || null,
        settings.githubInstallationId || null,
        settings.jiraBaseUrl || null,
        settings.jiraEmail || null,
        settings.jiraApiTokenEncrypted || null,
        settings.requiredReviewers || 2,
        settings.reminderHours || 24,
        settings.reminderEscalationHours || 48,
        settings.feLabels || null,
        settings.beLabels || null
      ]
    );
  }

  private mapRowToWorkspaceSettings(row: any): any {
    return {
      slackTeamId: row.slack_team_id,
      defaultChannelId: row.default_channel_id,
      githubInstallationId: row.github_installation_id,
      jiraBaseUrl: row.jira_base_url,
      jiraEmail: row.jira_email,
      jiraApiTokenEncrypted: row.jira_api_token_encrypted,
      requiredReviewers: row.required_reviewers,
      reminderHours: row.reminder_hours,
      reminderEscalationHours: row.reminder_escalation_hours,
      feLabels: row.fe_labels,
      beLabels: row.be_labels,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    };
  }

  // Slack installation operations (for OAuth)
  async getSlackInstallation(teamId: string): Promise<any | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM slack_installations WHERE team_id = $1',
      [teamId]
    );
    return result.rows[0] ? this.mapRowToSlackInstallation(result.rows[0]) : undefined;
  }

  async upsertSlackInstallation(installation: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO slack_installations (team_id, bot_token, bot_id, bot_user_id, installer_user_id, team_name, installed_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (team_id) DO UPDATE SET
         bot_token = EXCLUDED.bot_token,
         bot_id = EXCLUDED.bot_id,
         bot_user_id = EXCLUDED.bot_user_id,
         installer_user_id = EXCLUDED.installer_user_id,
         team_name = EXCLUDED.team_name,
         updated_at = NOW()`,
      [
        installation.teamId,
        installation.botToken,
        installation.botId || null,
        installation.botUserId || null,
        installation.installerUserId || null,
        installation.teamName || null
      ]
    );
  }

  async deleteSlackInstallation(teamId: string): Promise<void> {
    await this.pool.query('DELETE FROM slack_installations WHERE team_id = $1', [teamId]);
  }

  private mapRowToSlackInstallation(row: any): any {
    return {
      teamId: row.team_id,
      botToken: row.bot_token,
      botId: row.bot_id,
      botUserId: row.bot_user_id,
      installerUserId: row.installer_user_id,
      teamName: row.team_name,
      installedAt: row.installed_at ? new Date(row.installed_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    };
  }

  // Jira Connection operations
  async getJiraConnection(workspaceId: string): Promise<any | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM jira_connections WHERE workspace_id = $1',
      [workspaceId]
    );
    return result.rows[0] ? this.mapRowToJiraConnection(result.rows[0]) : undefined;
  }

  async upsertJiraConnection(connection: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO jira_connections (id, workspace_id, base_url, email, api_token, pr_opened_transition, pr_merged_transition, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (workspace_id) DO UPDATE SET
         base_url = EXCLUDED.base_url,
         email = EXCLUDED.email,
         api_token = EXCLUDED.api_token,
         pr_opened_transition = EXCLUDED.pr_opened_transition,
         pr_merged_transition = EXCLUDED.pr_merged_transition,
         updated_at = EXCLUDED.updated_at`,
      [
        connection.id,
        connection.workspaceId,
        connection.baseUrl,
        connection.email,
        connection.tokenEncrypted,
        connection.prOpenedTransition || null,
        connection.prMergedTransition || null,
        connection.createdAt,
        connection.updatedAt
      ]
    );
  }

  async deleteJiraConnection(workspaceId: string): Promise<void> {
    await this.pool.query('DELETE FROM jira_connections WHERE workspace_id = $1', [workspaceId]);
  }

  private mapRowToJiraConnection(row: any): any {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      baseUrl: row.base_url,
      email: row.email,
      authType: 'basic',
      tokenEncrypted: row.api_token,
      prOpenedTransition: row.pr_opened_transition || undefined,
      prMergedTransition: row.pr_merged_transition || undefined,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    };
  }

  // Team operations
  async addTeam(team: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO teams (id, workspace_id, name, slack_channel_id, is_active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         slack_channel_id = EXCLUDED.slack_channel_id,
         is_active = EXCLUDED.is_active`,
      [team.id, team.workspaceId, team.name, team.slackChannelId || null, team.isActive !== false, team.createdAt]
    );
  }

  async getTeam(id: string): Promise<any | undefined> {
    const result = await this.pool.query('SELECT * FROM teams WHERE id = $1', [id]);
    if (result.rows.length === 0) return undefined;
    return this.rowToTeam(result.rows[0]);
  }

  async listTeams(workspaceId: string): Promise<any[]> {
    const result = await this.pool.query(
      'SELECT * FROM teams WHERE workspace_id = $1 ORDER BY created_at',
      [workspaceId]
    );
    return result.rows.map(row => this.rowToTeam(row));
  }

  async updateTeam(id: string, updates: Partial<any>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(updates.name);
    }
    if (updates.slackChannelId !== undefined) {
      fields.push(`slack_channel_id = $${paramCount++}`);
      values.push(updates.slackChannelId);
    }
    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(updates.isActive);
    }

    if (fields.length === 0) return;

    values.push(id);
    await this.pool.query(
      `UPDATE teams SET ${fields.join(', ')} WHERE id = $${paramCount}`,
      values
    );
  }

  async removeTeam(id: string): Promise<void> {
    await this.pool.query('DELETE FROM teams WHERE id = $1', [id]);
  }

  private rowToTeam(row: any): any {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      name: row.name,
      slackChannelId: row.slack_channel_id || undefined,
      isActive: row.is_active !== false,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    };
  }

  // Repo mapping operations
  async addRepoMapping(mapping: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO repo_mappings (id, workspace_id, team_id, repo_full_name, required_reviewers, stack_rules, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (workspace_id, repo_full_name) DO UPDATE SET
         team_id = EXCLUDED.team_id,
         required_reviewers = EXCLUDED.required_reviewers,
         stack_rules = EXCLUDED.stack_rules`,
      [
        mapping.id,
        mapping.workspaceId,
        mapping.teamId || null,
        mapping.repoFullName,
        mapping.requiredReviewers || 2,
        mapping.stackRules ? JSON.stringify(mapping.stackRules) : null,
        mapping.createdAt
      ]
    );
  }

  async getRepoMapping(workspaceId: string, repoFullName: string): Promise<any | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM repo_mappings WHERE workspace_id = $1 AND repo_full_name = $2',
      [workspaceId, repoFullName]
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToRepoMapping(result.rows[0]);
  }

  async listRepoMappings(workspaceId: string, teamId?: string): Promise<any[]> {
    let result: QueryResult;
    if (teamId) {
      result = await this.pool.query(
        'SELECT * FROM repo_mappings WHERE workspace_id = $1 AND team_id = $2 ORDER BY created_at',
        [workspaceId, teamId]
      );
    } else {
      result = await this.pool.query(
        'SELECT * FROM repo_mappings WHERE workspace_id = $1 ORDER BY created_at',
        [workspaceId]
      );
    }
    return result.rows.map(row => this.rowToRepoMapping(row));
  }

  async removeRepoMapping(id: string): Promise<void> {
    await this.pool.query('DELETE FROM repo_mappings WHERE id = $1', [id]);
  }

  private rowToRepoMapping(row: any): any {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      teamId: row.team_id || undefined,
      repoFullName: row.repo_full_name,
      requiredReviewers: row.required_reviewers || 2,
      stackRules: row.stack_rules ? JSON.parse(row.stack_rules) : undefined,
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

