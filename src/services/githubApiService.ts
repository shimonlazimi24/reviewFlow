// GitHub API Service for making authenticated requests using GitHub App installation tokens
import { logger } from '../utils/logger';
import { env } from '../config/env';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

interface InstallationToken {
  token: string;
  expiresAt: number; // Unix timestamp
}

interface GitHubCommit {
  sha: string;
  author: {
    login?: string;
    name?: string;
  } | null;
  commit: {
    author: {
      name: string;
      email: string;
    };
  };
}

interface GitHubFile {
  filename: string;
  additions: number;
  deletions: number;
  changes: number;
  status: string;
}

// In-memory token cache (per installation ID)
const tokenCache = new Map<string, InstallationToken>();

/**
 * Generate JWT token for GitHub App authentication
 */
function generateJWT(): string {
  if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
    throw new Error('GitHub App credentials not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued at (1 minute ago to account for clock skew)
    exp: now + 600, // Expires in 10 minutes
    iss: env.GITHUB_APP_ID
  };

  const privateKey = env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
}

/**
 * Get installation access token (cached)
 */
async function getInstallationToken(installationId: string): Promise<string> {
  // Check cache
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + 60000) { // 1 minute buffer
    return cached.token;
  }

  // Generate JWT
  const jwtToken = generateJWT();

  // Request installation token
  const response = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${jwtToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReviewFlow/1.0'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('Failed to get installation token', { installationId, status: response.status, error });
    throw new Error(`Failed to get GitHub installation token: ${response.status} ${error}`);
  }

  const data = await response.json();
  const token = data.token;
  const expiresAt = Date.now() + (data.expires_at ? new Date(data.expires_at).getTime() - Date.now() : 3600000);

  // Cache token
  tokenCache.set(installationId, { token, expiresAt });

  logger.info('GitHub installation token obtained', { installationId, expiresAt: new Date(expiresAt).toISOString() });

  return token;
}

/**
 * Make authenticated GitHub API request
 */
async function githubRequest(installationId: string, path: string, options: RequestInit = {}): Promise<any> {
  const token = await getInstallationToken(installationId);
  const url = path.startsWith('http') ? path : `https://api.github.com${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ReviewFlow/1.0',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error('GitHub API request failed', { path, status: response.status, error });
    throw new Error(`GitHub API error: ${response.status} ${error}`);
  }

  return response.json();
}

export class GitHubApiService {
  constructor(private installationId: string) {
    if (!installationId) {
      throw new Error('GitHub installation ID is required');
    }
  }

  /**
   * List commits for a pull request
   */
  async listPullRequestCommits(repoFullName: string, prNumber: number): Promise<{ authorLogins: string[] }> {
    try {
      const commits = await githubRequest(
        this.installationId,
        `/repos/${repoFullName}/pulls/${prNumber}/commits`
      ) as GitHubCommit[];

      const authorLogins: string[] = [];
      for (const commit of commits) {
        // Try to get login from author (if available)
        if (commit.author?.login) {
          if (!authorLogins.includes(commit.author.login)) {
            authorLogins.push(commit.author.login);
          }
        }
        // Fallback: try to match by email/name (less reliable)
        // Note: We can't reliably map email to GitHub username without additional API calls
      }

      logger.info('Fetched PR commits', { repoFullName, prNumber, commitCount: commits.length, authorLogins });
      return { authorLogins };
    } catch (error: any) {
      logger.error('Error fetching PR commits', { repoFullName, prNumber, error: error.message });
      return { authorLogins: [] }; // Return empty on error
    }
  }

  /**
   * List files changed in a pull request
   */
  async listPullRequestFiles(repoFullName: string, prNumber: number): Promise<{ files: Array<{ filename: string; additions: number; deletions: number; changes: number }> }> {
    try {
      const files = await githubRequest(
        this.installationId,
        `/repos/${repoFullName}/pulls/${prNumber}/files`
      ) as GitHubFile[];

      const result = files.map(f => ({
        filename: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes
      }));

      logger.info('Fetched PR files', { repoFullName, prNumber, fileCount: files.length });
      return { files: result };
    } catch (error: any) {
      logger.error('Error fetching PR files', { repoFullName, prNumber, error: error.message });
      return { files: [] }; // Return empty on error
    }
  }

  /**
   * Get pull request details
   */
  async getPullRequest(repoFullName: string, prNumber: number): Promise<any> {
    try {
      const pr = await githubRequest(
        this.installationId,
        `/repos/${repoFullName}/pulls/${prNumber}`
      );
      return pr;
    } catch (error: any) {
      logger.error('Error fetching PR', { repoFullName, prNumber, error: error.message });
      throw error;
    }
  }

  /**
   * Clear token cache for this installation (useful for testing or forced refresh)
   */
  static clearTokenCache(installationId: string): void {
    tokenCache.delete(installationId);
  }
}

