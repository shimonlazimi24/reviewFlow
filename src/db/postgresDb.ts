// PostgreSQL database implementation
import { Pool, QueryResult } from 'pg';
import { Member, PrRecord, Assignment, Role, PrStatus, PrSize, Stack } from './memoryDb';

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
        slack_user_id VARCHAR(255) UNIQUE NOT NULL,
        github_usernames TEXT[] NOT NULL,
        roles TEXT[] NOT NULL,
        weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        is_unavailable BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      -- Add is_unavailable column if it doesn't exist (for existing databases)
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'members' AND column_name = 'is_unavailable'
        ) THEN
          ALTER TABLE members ADD COLUMN is_unavailable BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS prs (
        id VARCHAR(255) PRIMARY KEY,
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
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(repo_full_name, number)
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id VARCHAR(255) PRIMARY KEY,
        pr_id VARCHAR(255) NOT NULL REFERENCES prs(id) ON DELETE CASCADE,
        member_id VARCHAR(255) NOT NULL REFERENCES members(id) ON DELETE CASCADE,
        created_at BIGINT NOT NULL,
        completed_at BIGINT,
        slack_user_id VARCHAR(255),
        created_at_ts TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_assignments_pr_id ON assignments(pr_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_member_id ON assignments(member_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_slack_user_id ON assignments(slack_user_id);
      CREATE INDEX IF NOT EXISTS idx_prs_repo_number ON prs(repo_full_name, number);
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

  async listMembers(): Promise<Member[]> {
    const result = await this.pool.query('SELECT * FROM members ORDER BY created_at');
    return result.rows.map(row => this.rowToMember(row));
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
  async findPr(repoFullName: string, number: number): Promise<PrRecord | undefined> {
    const result = await this.pool.query(
      'SELECT * FROM prs WHERE repo_full_name = $1 AND number = $2',
      [repoFullName, number]
    );
    if (result.rows.length === 0) return undefined;
    return this.rowToPr(result.rows[0]);
  }

  async upsertPr(pr: PrRecord): Promise<PrRecord> {
    await this.pool.query(
      `INSERT INTO prs (id, repo_full_name, number, title, url, author_github, created_at, status, size, stack, jira_issue_key, slack_channel_id, slack_message_ts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (repo_full_name, number) DO UPDATE SET
         title = $4,
         url = $5,
         status = $8,
         size = $9,
         stack = $10,
         jira_issue_key = $11,
         slack_channel_id = $12,
         slack_message_ts = $13,
         updated_at = NOW()`,
      [pr.id, pr.repoFullName, pr.number, pr.title, pr.url, pr.authorGithub, pr.createdAt, pr.status, pr.size, pr.stack, pr.jiraIssueKey || null, pr.slackChannelId, pr.slackMessageTs || null]
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

  async listOpenPrs(): Promise<PrRecord[]> {
    const result = await this.pool.query("SELECT * FROM prs WHERE status = 'OPEN' ORDER BY created_at DESC");
    return result.rows.map(row => this.rowToPr(row));
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
        slackUserId: member.slackUserId
      };

      await this.pool.query(
        'INSERT INTO assignments (id, pr_id, member_id, created_at, slack_user_id) VALUES ($1, $2, $3, $4, $5)',
        [assignment.id, assignment.prId, assignment.memberId, assignment.createdAt, assignment.slackUserId]
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
      'UPDATE assignments SET completed_at = $1 WHERE id = $2 AND completed_at IS NULL',
      [Date.now(), assignmentId]
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
      slackUserId: row.slack_user_id,
      githubUsernames: row.github_usernames || [],
      roles: row.roles || [],
      weight: parseFloat(row.weight) || 1.0,
      isActive: row.is_active !== false,
      isUnavailable: row.is_unavailable === true
    };
  }

  private rowToPr(row: any): PrRecord {
    return {
      id: row.id,
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
      slackMessageTs: row.slack_message_ts || undefined
    };
  }

  private rowToAssignment(row: any): Assignment {
    return {
      id: row.id,
      prId: row.pr_id,
      memberId: row.member_id,
      createdAt: row.created_at,
      completedAt: row.completed_at || undefined,
      slackUserId: row.slack_user_id || undefined
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

