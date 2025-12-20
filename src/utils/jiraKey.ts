// מזהה משהו כמו ABC-123
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]+-\d+)\b/;

export function extractJiraIssueKey(input: string): string | undefined {
  const m = input.match(JIRA_KEY_RE);
  return m?.[1];
}

