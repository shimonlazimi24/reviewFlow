// Stack inference utilities
import { Stack, StackRule } from '../db/memoryDb';
import { inferStackFromLabels, GitHubLabel } from '../services/assignmentService';
import { minimatch } from 'minimatch';

/**
 * Simple glob matcher (fallback if minimatch fails)
 */
function matchesGlob(filename: string, pattern: string): boolean {
  try {
    return minimatch(filename, pattern);
  } catch {
    // Fallback: simple prefix/suffix matching
    if (pattern.endsWith('**')) {
      const prefix = pattern.slice(0, -2);
      return filename.startsWith(prefix);
    }
    if (pattern.includes('*')) {
      const parts = pattern.split('*');
      return filename.startsWith(parts[0]) && filename.endsWith(parts[parts.length - 1]);
    }
    return filename === pattern;
  }
}

/**
 * Infer stack from file paths using configured rules
 */
export function inferStackFromPaths(
  files: Array<{ filename: string }>,
  stackRules: StackRule[] = []
): Stack {
  if (!files || files.length === 0) {
    return 'MIXED'; // Default
  }

  if (stackRules.length === 0) {
    return 'MIXED'; // No rules configured
  }

  const matchedStacks: Set<Stack> = new Set();

  for (const file of files) {
    for (const rule of stackRules) {
      // Use glob pattern matching
      if (matchesGlob(file.filename, rule.glob)) {
        matchedStacks.add(rule.stack);
      }
    }
  }

  // If both FE and BE paths matched, return MIXED
  const hasFE = matchedStacks.has('FE');
  const hasBE = matchedStacks.has('BE');
  
  if (hasFE && hasBE) {
    return 'MIXED';
  }
  if (hasFE) {
    return 'FE';
  }
  if (hasBE) {
    return 'BE';
  }

  // If no rules matched, default to MIXED
  return 'MIXED';
}

/**
 * Infer stack with fallback: labels first, then paths
 */
export function inferStack(
  labels: GitHubLabel[] | any[],
  files: Array<{ filename: string }> = [],
  stackRules: StackRule[] = [],
  feLabels?: string,
  beLabels?: string
): Stack {
  // Try labels first (with configured FE/BE labels)
  const fromLabels = inferStackFromLabels(labels, feLabels, beLabels);
  if (fromLabels !== 'MIXED' || labels.length === 0) {
    return fromLabels;
  }

  // Fallback to path rules if labels didn't help
  return inferStackFromPaths(files, stackRules);
}

