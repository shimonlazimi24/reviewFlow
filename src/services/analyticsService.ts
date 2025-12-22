// Analytics and metrics tracking service
import { db, PrRecord, Assignment, Member } from '../db/memoryDb';
import { logger } from '../utils/logger';
import { calculateWaitingTime, formatDuration } from '../utils/time';

export interface ReviewMetrics {
  totalPRs: number;
  openPRs: number;
  closedPRs: number;
  mergedPRs: number;
  averageReviewTime: number; // milliseconds
  averageWaitingTime: number; // milliseconds
  totalReviews: number;
  completedReviews: number;
  inProgressReviews: number;
  pendingReviews: number;
}

export interface TeamMetrics {
  teamId?: string;
  teamName?: string;
  memberCount: number;
  activeMemberCount: number;
  totalPRs: number;
  openPRs: number;
  averageReviewTime: number;
  averageWaitingTime: number;
  workloadDistribution: Array<{
    memberId: string;
    slackUserId: string;
    openReviews: number;
    completedReviews: number;
  }>;
}

export interface PRMetrics {
  prId: string;
  prNumber: number;
  title: string;
  repoFullName: string;
  authorGithub: string;
  createdAt: number;
  waitingTime: number;
  reviewTime?: number; // Time from assignment to completion
  status: string;
  size: string;
  stack: string;
  reviewers: Array<{
    memberId: string;
    slackUserId: string;
    assignedAt: number;
    completedAt?: number;
    reviewTime?: number;
  }>;
}

export class AnalyticsService {
  /**
   * Get overall review metrics
   */
  async getReviewMetrics(teamId?: string): Promise<ReviewMetrics> {
    try {
      const allPRs = await db.listOpenPrs(teamId);
      const allAssignments: Assignment[] = [];
      const allMembers = await db.listMembers(teamId);

      // Collect all assignments
      for (const pr of allPRs) {
        const assignments = await db.getAssignmentsForPr(pr.id);
        allAssignments.push(...assignments);
      }

      // Calculate metrics
      const totalPRs = allPRs.length;
      const openPRs = allPRs.filter((p: PrRecord) => p.status === 'OPEN').length;
      const closedPRs = allPRs.filter((p: PrRecord) => p.status === 'CLOSED').length;
      const mergedPRs = allPRs.filter((p: PrRecord) => p.status === 'MERGED').length;

      // Calculate review times
      const completedAssignments = allAssignments.filter(a => a.status === 'DONE' && a.completedAt);
      const reviewTimes = completedAssignments.map(a => (a.completedAt! - a.createdAt));
      const averageReviewTime = reviewTimes.length > 0
        ? reviewTimes.reduce((sum, time) => sum + time, 0) / reviewTimes.length
        : 0;

      // Calculate waiting times
      const waitingTimes = allPRs.map((pr: PrRecord) => calculateWaitingTime(pr.createdAt));
      const averageWaitingTime = waitingTimes.length > 0
        ? waitingTimes.reduce((sum: number, time: number) => sum + time, 0) / waitingTimes.length
        : 0;

      const totalReviews = allAssignments.length;
      const completedReviews = allAssignments.filter(a => a.status === 'DONE').length;
      const inProgressReviews = allAssignments.filter(a => a.status === 'IN_PROGRESS').length;
      const pendingReviews = allAssignments.filter(a => a.status === 'ASSIGNED').length;

      return {
        totalPRs,
        openPRs,
        closedPRs,
        mergedPRs,
        averageReviewTime,
        averageWaitingTime,
        totalReviews,
        completedReviews,
        inProgressReviews,
        pendingReviews
      };
    } catch (error) {
      logger.error('Error calculating review metrics', error);
      throw error;
    }
  }

  /**
   * Get team-specific metrics
   */
  async getTeamMetrics(teamId?: string): Promise<TeamMetrics> {
    try {
      const members = await db.listMembers(teamId);
      const activeMembers = members.filter((m: Member) => m.isActive && !m.isUnavailable);
      const openPRs = await db.listOpenPrs(teamId);

      // Get workload distribution
      const workloadDistribution = await Promise.all(
        members.map(async (member: Member) => {
          const assignments = await db.getOpenAssignmentsForMember(member.id);
          const completedAssignments = assignments.filter((a: Assignment) => a.status === 'DONE');
          const openReviews = assignments.filter((a: Assignment) => a.status !== 'DONE').length;

          return {
            memberId: member.id,
            slackUserId: member.slackUserId,
            openReviews,
            completedReviews: completedAssignments.length
          };
        })
      );

      // Calculate average review time for this team
      const allAssignments: Assignment[] = [];
      for (const pr of openPRs) {
        const assignments = await db.getAssignmentsForPr(pr.id);
        allAssignments.push(...assignments);
      }

      const completedAssignments = allAssignments.filter(a => a.status === 'DONE' && a.completedAt);
      const reviewTimes = completedAssignments.map(a => (a.completedAt! - a.createdAt));
      const averageReviewTime = reviewTimes.length > 0
        ? reviewTimes.reduce((sum, time) => sum + time, 0) / reviewTimes.length
        : 0;

      const waitingTimes = openPRs.map((pr: PrRecord) => calculateWaitingTime(pr.createdAt));
      const averageWaitingTime = waitingTimes.length > 0
        ? waitingTimes.reduce((sum: number, time: number) => sum + time, 0) / waitingTimes.length
        : 0;

      // Get team name if teamId provided
      let teamName: string | undefined;
      if (teamId) {
        const team = await db.getTeam(teamId);
        teamName = team?.name;
      }

      return {
        teamId,
        teamName,
        memberCount: members.length,
        activeMemberCount: activeMembers.length,
        totalPRs: openPRs.length,
        openPRs: openPRs.filter((p: PrRecord) => p.status === 'OPEN').length,
        averageReviewTime,
        averageWaitingTime,
        workloadDistribution
      };
    } catch (error) {
      logger.error('Error calculating team metrics', error);
      throw error;
    }
  }

  /**
   * Get metrics for a specific PR
   */
  async getPRMetrics(prId: string): Promise<PRMetrics | null> {
    try {
      const pr = await db.getPr(prId);
      if (!pr) return null;

      const assignments = await db.getAssignmentsForPr(prId);
      const waitingTime = calculateWaitingTime(pr.createdAt);

      const reviewers = await Promise.all(
        assignments.map(async (assignment: Assignment) => {
          const member = await db.getMember(assignment.memberId);
          const reviewTime = assignment.completedAt && assignment.createdAt
            ? assignment.completedAt - assignment.createdAt
            : undefined;

          return {
            memberId: assignment.memberId,
            slackUserId: member?.slackUserId || 'unknown',
            assignedAt: assignment.createdAt,
            completedAt: assignment.completedAt,
            reviewTime
          };
        })
      );

      // Calculate overall review time (from first assignment to last completion)
      const completedAssignments = assignments.filter((a: Assignment) => a.completedAt);
      const reviewTime = completedAssignments.length > 0 && assignments.length > 0
        ? Math.max(...completedAssignments.map((a: Assignment) => a.completedAt!)) - Math.min(...assignments.map((a: Assignment) => a.createdAt))
        : undefined;

      return {
        prId: pr.id,
        prNumber: pr.number,
        title: pr.title,
        repoFullName: pr.repoFullName,
        authorGithub: pr.authorGithub,
        createdAt: pr.createdAt,
        waitingTime,
        reviewTime,
        status: pr.status,
        size: pr.size,
        stack: pr.stack,
        reviewers
      };
    } catch (error) {
      logger.error('Error calculating PR metrics', error);
      throw error;
    }
  }

  /**
   * Format metrics for Slack display
   */
  formatMetricsForSlack(metrics: ReviewMetrics): string {
    const avgReviewTime = formatDuration(metrics.averageReviewTime);
    const avgWaitingTime = formatDuration(metrics.averageWaitingTime);

    return `📊 *Review Metrics*\n\n` +
      `*PRs:*\n` +
      `• Total: ${metrics.totalPRs}\n` +
      `• Open: ${metrics.openPRs}\n` +
      `• Closed: ${metrics.closedPRs}\n` +
      `• Merged: ${metrics.mergedPRs}\n\n` +
      `*Reviews:*\n` +
      `• Total: ${metrics.totalReviews}\n` +
      `• Completed: ${metrics.completedReviews}\n` +
      `• In Progress: ${metrics.inProgressReviews}\n` +
      `• Pending: ${metrics.pendingReviews}\n\n` +
      `*Timing:*\n` +
      `• Average Review Time: ${avgReviewTime}\n` +
      `• Average Waiting Time: ${avgWaitingTime}`;
  }
}

