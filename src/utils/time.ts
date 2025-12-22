// Time utility functions

/**
 * Format time duration in human-readable format
 * @param milliseconds - Duration in milliseconds
 * @returns Human-readable string (e.g., "2h 30m", "5m", "1d 3h")
 */
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

/**
 * Calculate waiting time since assignment was created
 * @param createdAt - Timestamp when assignment was created
 * @returns Duration in milliseconds
 */
export function calculateWaitingTime(createdAt: number): number {
  return Date.now() - createdAt;
}

/**
 * Format waiting time with emoji indicator
 * @param waitingTimeMs - Waiting time in milliseconds
 * @returns Formatted string with emoji
 */
export function formatWaitingTime(waitingTimeMs: number): string {
  const hours = waitingTimeMs / (1000 * 60 * 60);
  
  if (hours >= 24) {
    return `🔴 ${formatDuration(waitingTimeMs)} (overdue)`;
  } else if (hours >= 8) {
    return `🟡 ${formatDuration(waitingTimeMs)} (long wait)`;
  } else {
    return `🟢 ${formatDuration(waitingTimeMs)}`;
  }
}

