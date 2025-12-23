// Audit logging utility
import { db } from '../db/memoryDb';
import { logger } from './logger';

export interface AuditLogEvent {
  workspaceId: string;
  event: string;
  userId?: string;
  metadata?: Record<string, any>;
}

export async function logAuditEvent(event: AuditLogEvent): Promise<void> {
  try {
    await db.addAuditLog({
      ...event,
      timestamp: Date.now()
    });
    logger.debug('Audit log entry created', { event: event.event, workspaceId: event.workspaceId });
  } catch (error) {
    logger.error('Failed to create audit log entry', error);
    // Don't throw - audit logging should not break the flow
  }
}

// Convenience functions for common events
export async function logInstallation(workspaceId: string, userId: string, type: 'slack' | 'github'): Promise<void> {
  await logAuditEvent({
    workspaceId,
    event: `${type}_installed`,
    userId,
    metadata: { type }
  });
}

export async function logConnection(workspaceId: string, userId: string, type: 'jira' | 'github', action: 'connected' | 'disconnected'): Promise<void> {
  await logAuditEvent({
    workspaceId,
    event: `${type}_${action}`,
    userId,
    metadata: { type, action }
  });
}

export async function logWebhook(workspaceId: string, type: 'github' | 'polar', event: string): Promise<void> {
  await logAuditEvent({
    workspaceId,
    event: `webhook_${type}_${event}`,
    metadata: { type, event }
  });
}

export async function logBillingChange(workspaceId: string, action: string, metadata?: Record<string, any>): Promise<void> {
  await logAuditEvent({
    workspaceId,
    event: `billing_${action}`,
    metadata
  });
}

