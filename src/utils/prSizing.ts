import { PrSize } from '../db/memoryDb';

export interface PrMetadata {
  additions: number;
  deletions: number;
  changedFiles: number;
  totalChanges: number;
  size: PrSize;
}

/**
 * Calculate PR size and extract metadata from GitHub payload
 */
export function calcPrSizeFromGitHub(payload: any): PrMetadata {
  const additions = Number(payload?.pull_request?.additions ?? 0);
  const deletions = Number(payload?.pull_request?.deletions ?? 0);
  const changedFiles = Number(payload?.pull_request?.changed_files ?? 0);
  const total = additions + deletions;

  // Enhanced size calculation considering both lines and files
  let size: PrSize;
  
  if (total <= 200 && changedFiles <= 5) {
    size = 'SMALL';
  } else if (total <= 800 && changedFiles <= 15) {
    size = 'MEDIUM';
  } else {
    size = 'LARGE';
  }

  // Override to LARGE if too many files (even with fewer lines)
  if (changedFiles > 20) {
    size = 'LARGE';
  }

  // Override to LARGE if very large change (even with few files)
  if (total > 1000) {
    size = 'LARGE';
  }

  return {
    additions,
    deletions,
    changedFiles,
    totalChanges: total,
    size
  };
}

