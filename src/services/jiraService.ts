// Jira integration service - workspace-scoped
import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { decrypt } from '../utils/encryption';
import { JiraConnection } from '../db/memoryDb';

export interface JiraIssueMinimal {
  key: string;
  summary: string;
  status: string;
  assignee?: string;
  url: string;
}

export class JiraService {
  private client: AxiosInstance;
  private baseUrl: string;
  private workspaceId: string;

  constructor(connection: JiraConnection) {
    this.workspaceId = connection.workspaceId;
    this.baseUrl = connection.baseUrl;
    
    // Decrypt token
    let apiToken: string;
    try {
      apiToken = decrypt(connection.tokenEncrypted);
    } catch (error) {
      logger.error('Failed to decrypt Jira token', error);
      throw new AppError('Failed to decrypt Jira credentials', 500);
    }
    
    const auth = Buffer.from(`${connection.email}:${apiToken}`).toString('base64');

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  getWorkspaceId(): string {
    return this.workspaceId;
  }

  async getIssueMinimal(issueKey: string): Promise<JiraIssueMinimal> {
    try {
      const response = await this.client.get(`/rest/api/3/issue/${issueKey}`, {
        params: {
          fields: 'summary,status,assignee'
        }
      }).catch(async (error: AxiosError) => {
        // Handle rate limiting with retry
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || '60';
          logger.warn('Jira rate limit hit, retrying after delay', { retryAfter, issueKey });
          await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
          return this.client.get(`/rest/api/3/issue/${issueKey}`, {
            params: {
              fields: 'summary,status,assignee'
            }
          });
        }
        throw error;
      });

      const issue = (await response).data;
      return {
        key: issue.key,
        summary: issue.fields?.summary || 'No summary',
        status: issue.fields?.status?.name || 'Unknown',
        assignee: issue.fields?.assignee?.displayName,
        url: `${this.baseUrl}/browse/${issue.key}`
      };
    } catch (error: any) {
      // Graceful degradation - don't block the flow
      if (error.response?.status === 429 || error.response?.status === 503) {
        logger.warn(`Jira rate limit or service unavailable for ${issueKey}`, error);
        // Return minimal info instead of throwing
        return {
          key: issueKey,
          summary: 'Unable to fetch (rate limited)',
          status: 'Unknown',
          url: `${this.baseUrl}/browse/${issueKey}`
        };
      }
      logger.error(`Failed to fetch Jira issue ${issueKey}`, error);
      throw new AppError(`Failed to fetch Jira issue ${issueKey}: ${error.message}`, error.response?.status || 500);
    }
  }

  async addComment(issueKey: string, comment: string): Promise<void> {
    try {
      // Jira API v3 format
      await this.client.post(`/rest/api/3/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment
                }
              ]
            }
          ]
        }
      });
    } catch (error: any) {
      // Fallback to API v2 format for compatibility
      try {
        await this.client.post(`/rest/api/2/issue/${issueKey}/comment`, {
          body: comment
        });
      } catch (fallbackError: any) {
        logger.error(`Failed to add comment to ${issueKey}`, error || fallbackError);
        throw new AppError(`Failed to add comment to ${issueKey}: ${error.message || fallbackError.message}`, error.response?.status || 500);
      }
    }
  }

  async transitionByName(issueKey: string, transitionName: string): Promise<void> {
    try {
      // First, get available transitions
      const transitionsResponse = await this.client.get(
        `/rest/api/3/issue/${issueKey}/transitions`
      );

      const transitions = transitionsResponse.data.transitions || [];
      const transition = transitions.find((t: any) => 
        t.name.toLowerCase() === transitionName.toLowerCase()
      );

      if (!transition) {
        throw new AppError(`Transition "${transitionName}" not found for issue ${issueKey}`, 404);
      }

      await this.client.post(`/rest/api/3/issue/${issueKey}/transitions`, {
        transition: {
          id: transition.id
        }
      });
    } catch (error: any) {
      logger.error(`Failed to transition ${issueKey} to "${transitionName}"`, error);
      throw new AppError(`Failed to transition ${issueKey} to "${transitionName}": ${error.message}`, error.response?.status || 500);
    }
  }

  async createIssue(args: {
    projectKey: string;
    summary: string;
    description?: string;
    issueType?: string;
    assignee?: string;
    sprintId?: number;
    labels?: string[];
  }): Promise<JiraIssueMinimal> {
    try {
      const { projectKey, summary, description, issueType = 'Task', assignee, sprintId, labels } = args;

      // Get project metadata to find issue type ID
      const projectResponse = await this.client.get(`/rest/api/3/project/${projectKey}`);
      const projectId = projectResponse.data.id;

      // Get issue types for the project
      const issueTypesResponse = await this.client.get(`/rest/api/3/project/${projectKey}`);
      const issueTypeObj = issueTypesResponse.data.issueTypes?.find((it: any) => 
        it.name.toLowerCase() === issueType.toLowerCase()
      );

      if (!issueTypeObj) {
        throw new AppError(`Issue type "${issueType}" not found in project ${projectKey}`, 404);
      }

      // Build fields object
      const fields: any = {
        project: { key: projectKey },
        summary,
        issuetype: { name: issueType }
      };

      if (description) {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: description
                }
              ]
            }
          ]
        };
      }

      if (assignee) {
        fields.assignee = { accountId: assignee };
      }

      if (labels && labels.length > 0) {
        fields.labels = labels;
      }

      // Add to sprint if sprintId is provided
      if (sprintId) {
        // Use default sprint field (can be configured per workspace)
        const sprintField = process.env.JIRA_DEFAULT_SPRINT_FIELD || 'customfield_10020';
        fields[sprintField] = sprintId;
      }

      const response = await this.client.post('/rest/api/3/issue', {
        fields
      });

      const issueKey = response.data.key;
      
      // Fetch the created issue to return full details
      return await this.getIssueMinimal(issueKey);
    } catch (error: any) {
      logger.error('Failed to create Jira issue', error);
      throw new AppError(`Failed to create Jira issue: ${error.message}`, error.response?.status || 500);
    }
  }

  async getActiveSprints(projectKey: string): Promise<Array<{ id: number; name: string; state: string }>> {
    try {
      // Try to get sprints from the board
      const boardsResponse = await this.client.get(`/rest/agile/1.0/board`, {
        params: {
          projectKeyOrId: projectKey,
          type: 'scrum'
        }
      });

      if (boardsResponse.data.values && boardsResponse.data.values.length > 0) {
        const boardId = boardsResponse.data.values[0].id;
        const sprintsResponse = await this.client.get(`/rest/agile/1.0/board/${boardId}/sprint`, {
          params: {
            state: 'active'
          }
        });

        return (sprintsResponse.data.values || []).map((sprint: any) => ({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state
        }));
      }

      return [];
    } catch (error: any) {
      logger.warn('Failed to fetch active sprints', error);
      return [];
    }
  }

  async addIssueToSprint(issueKey: string, sprintId: number): Promise<void> {
    try {
      const sprintField = process.env.JIRA_DEFAULT_SPRINT_FIELD || 'customfield_10020';

      await this.client.put(`/rest/api/3/issue/${issueKey}`, {
        fields: {
          [sprintField]: sprintId
        }
      });
    } catch (error: any) {
      try {
        await this.client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
          issues: [issueKey]
        });
      } catch (agileError: any) {
        logger.error(`Failed to add issue ${issueKey} to sprint`, error || agileError);
        throw new AppError(`Failed to add issue ${issueKey} to sprint: ${error.message || agileError.message}`, error.response?.status || 500);
      }
    }
  }
}
