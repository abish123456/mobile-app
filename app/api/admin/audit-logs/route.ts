import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../../lib/db';
import { verifyAdminAuthWithPermission } from '../../../../lib/admin-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Only super admins or admins with specific permission can view audit logs
    const isAuthorized = await verifyAdminAuthWithPermission(req, 'view_audit_logs');
    if (!isAuthorized) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const entity = searchParams.get('entity');
    const excludeEntity = searchParams.get('excludeEntity');
    const entityId = searchParams.get('entityId');
    const actorId = searchParams.get('actorId');
    const actorType = searchParams.get('actorType');
    const eventType = searchParams.get('eventType');
    const category = searchParams.get('category');
    const sortOrder = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (category) {
      if (category === 'order') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('ORDER');
      } else if (category === 'route') {
        conditions.push(`al."entity" = ANY($${paramIndex++})`);
        values.push(['ROUTE', 'SERVICE_ROUTE']);
      } else if (category === 'customer') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('CUSTOMER');
      } else if (category === 'master_data') {
        conditions.push(`al."entity" = ANY($${paramIndex++})`);
        values.push(['PRODUCT', 'SERVICE_AREA', 'SERVICE_ROUTE', 'DELIVERY_BOY', 'DELIVERY_STAFF', 'NOT_DELIVERED_REASON', 'FAILURE_REASON']);
      } else if (category === 'system') {
        conditions.push(`al."entity" = ANY($${paramIndex++}) AND al."entityId" != ANY($${paramIndex++})`);
        values.push(['SYSTEM_SETTING', 'SYSTEM_CONFIG', 'ADMIN', 'ADMIN_ROLE', 'HOLIDAY', 'SUPPORT_CONTACT', 'SESSION']);
        values.push(['SAME_DAY_CUTOFF_HOUR', 'SAME_DAY_CUTOFF_MINUTE']);
      }
    }

    if (eventType) {
      if (eventType === 'login') {
        conditions.push(`al."action" = $${paramIndex++}`);
        values.push('LOGIN');
      } else if (eventType === 'link_generated') {
        conditions.push(`al."entity" = $${paramIndex++} AND (
          al."newData"::jsonb->>'action' = 'TOKEN_GENERATED'
          OR al.action = 'TOKEN_GENERATED'
          OR al."description" ILIKE '%Generated new delivery tracking link%'
          OR al."description" ILIKE '%Generated route link%'
        )`);
        values.push('ROUTE');
      } else if (eventType === 'link_copied') {
        conditions.push(`al."entity" = $${paramIndex++} AND (
          al."newData"::jsonb->>'action' = 'TOKEN_COPIED'
          OR al.action = 'TOKEN_COPIED'
          OR al."description" ILIKE '%Copied delivery tracking link%'
          OR al."description" ILIKE '%Copied route link%'
        )`);
        values.push('ROUTE');
      } else if (eventType === 'reassign') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."action" = 'UPDATE' AND (al."description" ILIKE '%reassigned%' OR al."description" ILIKE '%moved%' OR al."description" ILIKE '%assigned order%')`);
        values.push('ORDER');
      } else if (eventType === 'reschedule') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."action" = 'UPDATE' AND (al."description" ILIKE '%Rescheduled%' OR al."description" ILIKE '%delivery date changed%')`);
        values.push('ORDER');
      } else if (eventType === 'cancel_order') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."action" = 'UPDATE' AND (al."description" ILIKE '%cancelled%' OR al."newData"::jsonb->>'status' = 'CANCELLED')`);
        values.push('ORDER');
      } else if (eventType === 'edit_address') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."description" ILIKE '%Updated delivery address%'`);
        values.push('ORDER');
      } else if (eventType === 'delivery_staff_change') {
        conditions.push(`((al."entity" = 'SERVICE_ROUTE' AND (al."newData"::jsonb->>'currentDeliveryBoyId' IS NOT NULL OR al."newData"::jsonb->>'deliveryBoyId' IS NOT NULL)) OR (al."entity" = 'ROUTE' AND (al."description" ILIKE '%delivery staff%' OR al."description" ILIKE 'Reassigned %' OR al."description" ILIKE 'Removed staff %' OR al."description" ILIKE '%assigned to %')))`);
      } else if (eventType === 'redistribution') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."action" = 'UPDATE' AND al."description" ILIKE '%redistributed%'`);
        values.push('ROUTE');
      } else if (eventType === 'hub_location') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."entityId" = 'HUB_LOCATION'`);
        values.push('SYSTEM_CONFIG');
      } else if (eventType === 'products') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('PRODUCT');
      } else if (eventType === 'routes') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('SERVICE_ROUTE');
      } else if (eventType === 'service_areas') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('SERVICE_AREA');
      } else if (eventType === 'delivery_reason') {
        conditions.push(`al."entity" = ANY($${paramIndex++})`);
        values.push(['NOT_DELIVERED_REASON', 'FAILURE_REASON']);
      } else if (eventType === 'delivery_staff') {
        conditions.push(`al."entity" = ANY($${paramIndex++})`);
        values.push(['DELIVERY_BOY', 'DELIVERY_STAFF']);
      } else if (eventType === 'customer_profile') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."action" = 'UPDATE'`);
        values.push('CUSTOMER');
      } else if (eventType === 'refund_action') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."action" = ANY($${paramIndex++})`);
        values.push('CUSTOMER');
        values.push(['APPROVE_DEPOSIT_REFUND', 'REJECT_DEPOSIT_REFUND']);
      } else if (eventType === 'settings_action') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('SYSTEM_SETTING');
      } else if (eventType === 'cutoff_settings') {
        conditions.push(`al."entity" = $${paramIndex++} AND al."entityId" = $${paramIndex++}`);
        values.push('SYSTEM_SETTING');
        values.push('CUT_OFF_TIME');
      } else if (eventType === 'delivery_settings') {
        conditions.push(`al."entity" = ANY($${paramIndex++}) AND al."entityId" ILIKE '%delivery%'`);
        values.push(['SYSTEM_SETTING', 'SYSTEM_CONFIG']);
      } else if (eventType === 'support_contacts') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('SUPPORT_CONTACT');
      } else if (eventType === 'holiday_settings') {
        conditions.push(`(al."entity" = 'HOLIDAY' OR (al."entity" = 'SYSTEM_SETTING' AND al."entityId" = 'HOLIDAY_WEEKDAYS'))`);
      } else if (eventType === 'user_settings') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('ADMIN');
      } else if (eventType === 'role_settings') {
        conditions.push(`al."entity" = $${paramIndex++}`);
        values.push('ADMIN_ROLE');
      }
    }

    if (entity) {
      conditions.push(`al."entity" = $${paramIndex++}`);
      values.push(entity);
    }

    if (excludeEntity) {
      conditions.push(`al."entity" != $${paramIndex++}`);
      values.push(excludeEntity);
    }

    if (entityId) {
      conditions.push(`al."entityId" = $${paramIndex++}`);
      values.push(entityId);
    }

    if (actorId) {
      conditions.push(`al."actorId" = $${paramIndex++}`);
      values.push(actorId);
    }

    if (actorType) {
      conditions.push(`al."actorType" = $${paramIndex++}`);
      values.push(actorType);
    }

    // Hide noisy route generation logs from the general admin logs list, only show them inside order details
    if (!entityId) {
        conditions.push(`al."description" != 'Route link generated. Delivery in progress.'`);
        conditions.push(`al."description" NOT ILIKE 'Route delivery staff was changed.%'`);
        conditions.push(`al."description" NOT ILIKE 'Order reassigned from %'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const totalResult = await query(
      `SELECT COUNT(*) as total FROM "AuditLog" al ${whereClause}`,
      values
    );
    const total = parseInt(totalResult.rows[0].total, 10);

    // Get logs with pagination and ordering
    const offset = (page - 1) * limit;

    // Add limit and offset to values
    values.push(limit);
    values.push(offset);

    const logsResult = await query(
      `SELECT al.*, 
             au.name as "adminName",
             au.username as "adminUsername",
             CASE 
               WHEN al.entity = 'ORDER' THEN (SELECT c.name FROM "Order" o JOIN "Customer" c ON o."customerId" = c.id WHERE o.id = al."entityId")
               WHEN al.entity = 'CUSTOMER' THEN (SELECT c.name FROM "Customer" c WHERE c.id = al."entityId")
               WHEN al.entity = 'PRODUCT' THEN (SELECT p.name FROM "Product" p WHERE p.id = al."entityId")
               WHEN al.entity = 'ADMIN' THEN (SELECT a.name FROM "Admin" a WHERE a.id = al."entityId")
               WHEN al.entity = 'ADMIN_ROLE' THEN (SELECT ar.name FROM "AdminRole" ar WHERE ar.id = al."entityId")
               WHEN al.entity = 'HOLIDAY' THEN (SELECT h.name FROM "Holiday" h WHERE h.id = al."entityId")
               WHEN al.entity = 'SUPPORT_CONTACT' THEN (SELECT sc.label FROM "SupportContact" sc WHERE sc.id = al."entityId")
               WHEN al.entity = 'SYSTEM_SETTING' THEN al."entityId"
               WHEN al.entity = 'ROUTE' THEN (SELECT sr.name FROM "Route" r JOIN "ServiceRoute" sr ON r."serviceRouteId" = sr.id WHERE r.id = al."entityId")
               WHEN al.entity = 'SERVICE_ROUTE' THEN (SELECT sr.name FROM "ServiceRoute" sr WHERE sr.id = al."entityId")
               WHEN al.entity = 'SERVICE_AREA' THEN (SELECT sa."areaName" FROM "ServiceArea" sa WHERE sa.id = al."entityId")
               ELSE NULL 
             END as "targetName",
             CASE
               WHEN al.entity = 'ORDER' THEN (SELECT o."orderNumber" FROM "Order" o WHERE o.id = al."entityId")
               ELSE NULL
             END as "orderNumber",
             CASE 
               WHEN al.entity = 'ORDER' THEN (SELECT c.name FROM "Order" o JOIN "Customer" c ON o."customerId" = c.id WHERE o.id = al."entityId")
               WHEN al.entity = 'CUSTOMER' THEN (SELECT c.name FROM "Customer" c WHERE c.id = al."entityId")
               ELSE NULL
             END as "customerName",
             CASE 
               WHEN al.entity = 'ORDER' THEN (SELECT c.phone FROM "Order" o JOIN "Customer" c ON o."customerId" = c.id WHERE o.id = al."entityId")
               WHEN al.entity = 'CUSTOMER' THEN (SELECT c.phone FROM "Customer" c WHERE c.id = al."entityId")
               ELSE NULL
             END as "customerPhone",
             CASE 
               WHEN al.entity = 'ORDER' THEN (SELECT o."customerId" FROM "Order" o WHERE o.id = al."entityId")
               WHEN al.entity = 'CUSTOMER' THEN al."entityId"
               ELSE NULL
             END as "customerId"
      FROM "AuditLog" al
      LEFT JOIN "Admin" au ON al."actorId" = au.id AND al."actorType" = 'ADMIN'
      ${whereClause} 
      ORDER BY al."createdAt" ${sortOrder} 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      values
    );
    const logs = logsResult.rows;

    // Resolve roleId UUIDs to role names in oldData/newData
    const roleIds = new Set<string>();
    logs.forEach(log => {
      [log.oldData, log.newData].forEach(data => {
        if (data?.roleId && typeof data.roleId === 'string') roleIds.add(data.roleId);
      });
    });
    if (roleIds.size > 0) {
      const rolesResult = await query<{ id: string; name: string }>(
        `SELECT id, name FROM "AdminRole" WHERE id = ANY($1)`,
        [Array.from(roleIds)]
      );
      const roleMap: Record<string, string> = {};
      rolesResult.rows.forEach(r => { roleMap[r.id] = r.name; });
      logs.forEach(log => {
        [log.oldData, log.newData].forEach(data => {
          if (data?.roleId && roleMap[data.roleId]) {
            data.roleName = roleMap[data.roleId];
            delete data.roleId;
          }
        });
      });
    }

    return NextResponse.json({
      success: true,
      logs,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
