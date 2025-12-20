import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';

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

  constructor() {
    this.baseUrl = env.JIRA_BASE_URL;
    const auth = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString('base64');

    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
  }

  async getIssueMinimal(issueKey: string): Promise<JiraIssueMinimal> {
    try {
      const response = await this.client.get(`/rest/api/3/issue/${issueKey}`, {
        params: {
          fields: 'summary,status,assignee'
        }
      });

      const issue = response.data;
      return {
        key: issue.key,
        summary: issue.fields?.summary || 'No summary',
        status: issue.fields?.status?.name || 'Unknown',
        assignee: issue.fields?.assignee?.displayName,
        url: `${this.baseUrl}/browse/${issue.key}`
      };
    } catch (error: any) {
      throw new Error(`Failed to fetch Jira issue ${issueKey}: ${error.message}`);
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
        throw new Error(`Failed to add comment to ${issueKey}: ${error.message || fallbackError.message}`);
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
        throw new Error(`Transition "${transitionName}" not found for issue ${issueKey}`);
      }

      await this.client.post(`/rest/api/3/issue/${issueKey}/transitions`, {
        transition: {
          id: transition.id
        }
      });
    } catch (error: any) {
      throw new Error(`Failed to transition ${issueKey} to "${transitionName}": ${error.message}`);
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
        throw new Error(`Issue type "${issueType}" not found in project ${projectKey}`);
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
        const sprintField = env.JIRA_DEFAULT_SPRINT_FIELD;
        fields[sprintField] = sprintId;
      }

      const response = await this.client.post('/rest/api/3/issue', {
        fields
      });

      const issueKey = response.data.key;
      
      // Fetch the created issue to return full details
      return await this.getIssueMinimal(issueKey);
    } catch (error: any) {
      throw new Error(`Failed to create Jira issue: ${error.message}`);
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
      console.warn('Failed to fetch active sprints:', error.message);
      return [];
    }
  }

  async addIssueToSprint(issueKey: string, sprintId: number): Promise<void> {
    try {
      const sprintField = env.JIRA_DEFAULT_SPRINT_FIELD;
      
      await this.client.put(`/rest/api/3/issue/${issueKey}`, {
        fields: {
          [sprintField]: sprintId
        }
      });
    } catch (error: any) {
      // Try alternative method using Agile API
      try {
        await this.client.post(`/rest/agile/1.0/sprint/${sprintId}/issue`, {
          issues: [issueKey]
        });
      } catch (agileError: any) {
        throw new Error(`Failed to add issue ${issueKey} to sprint: ${error.message || agileError.message}`);
      }
    }
  }
}

