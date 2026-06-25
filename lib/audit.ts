import { query } from './db';
import crypto from 'crypto';

export type AuditAction = 
  | 'CREATE' 
  | 'UPDATE' 
  | 'DELETE' 
  | 'ORDER_PLACED' 
  | 'LOGIN' 
  | 'EXPORT' 
  | string;

export type ActorType = 'ADMIN' | 'CUSTOMER' | 'SYSTEM' | 'DELIVERY_BOY';

interface LogActionParams {
  actorId?: string | null;
  actorType: ActorType;
  actorName?: string | null;
  entity: string;
  entityId: string;
  action: AuditAction;
  oldData?: any;
  newData?: any;
  description?: string;
}

/**
 * Asynchronously logs an action to the AuditLog table.
 * This runs in the background and catches its own errors so it doesn't fail the main request.
 */
export function logAction(params: LogActionParams) {
  // We use setImmediate or simply don't await the promise to ensure it's non-blocking
  Promise.resolve().then(async () => {
    try {
      const id = crypto.randomUUID();
      const oldDataStr = params.oldData ? JSON.stringify(params.oldData) : null;
      const newDataStr = params.newData ? JSON.stringify(params.newData) : null;

      await query(
        `INSERT INTO "AuditLog" 
         ("id", "actorId", "actorType", "actorName", "entity", "entityId", "action", "oldData", "newData", "description", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          params.actorId || null,
          params.actorType,
          params.actorName || null,
          params.entity,
          params.entityId,
          params.action,
          oldDataStr,
          newDataStr,
          params.description || null,
          new Date()
        ]
      );
    } catch (error) {
      // We only log to console to prevent crashing the main API request
      console.error('[AuditLog Error] Failed to write audit log:', error);
    }
  });
}
