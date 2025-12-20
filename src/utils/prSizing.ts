import { PrSize } from '../db/memoryDb';

export interface GitHubPrPayload {
  pull_request?: {
    additions?: number;
    deletions?: number;
    changed_files?: number;
  };
}

export function calcPrSizeFromGitHub(payload: GitHubPrPayload | any): PrSize {
  // GitHub PR payload includes additions/deletions/changed_files
  const additions = Number(payload?.pull_request?.additions ?? 0);
  const deletions = Number(payload?.pull_request?.deletions ?? 0);
  const total = additions + deletions;

  if (total <= 200) return 'SMALL';
  if (total <= 800) return 'MEDIUM';
  return 'LARGE';
}

