// T123 — AdminNotificationsController.
// 7 endpoints admin (cf. contracts/http-endpoints.md sections 1-7).
// Gardé par RoleGuard('admin') + AuthGuard (héritage 001/002).

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedUser } from '../../../identite/application/ports/auth-session-reader.port';
import { AuthGuard } from '../../../identite/interface/auth.guard';
import { RequireRole, RoleGuard } from '../../../identite/interface/role.guard';
import {
  NOTIFICATION_AUDIT_LOG_READER,
  type NotificationAuditLogReader,
} from '../../application/ports/notification-audit-log-reader.port';
import {
  NOTIFICATION_LOG_READER,
  type NotificationLogReader,
} from '../../application/ports/notification-log-reader.port';
import {
  SUPPRESSION_LIST_READER,
  type SuppressionListReader,
} from '../../application/ports/suppression-list-reader.port';
import type { RemoveFromSuppressionListUseCase } from '../../application/use-cases/remove-from-suppression-list.use-case';
import type { RetryDeadLetterUseCase } from '../../application/use-cases/retry-dead-letter.use-case';
import type { SuppressionReason } from '../../domain/enums/suppression-reason.enum';

interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const SuppressionListQuerySchema = z.object({
  reason: z.enum(['hard_bounce', 'soft_bounce_repeated', 'complaint', 'manual']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const DeadLetterQuerySchema = z.object({
  sourceModule: z.enum(['conformite', 'identite', 'intake', 'matching', 'facturation']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const AuditQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  eventType: z.string().max(120).optional(),
  actorId: z.string().uuid().optional(),
});

const RemoveSuppressionBodySchema = z.object({
  reason: z.string().min(10).max(1000),
});

const RetryDeadLetterBodySchema = z.object({
  reason: z.string().min(10).max(1000),
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

@Controller('api/admin/notifications')
@UseGuards(AuthGuard, RoleGuard)
@RequireRole('admin')
export class AdminNotificationsController {
  constructor(
    private readonly removeFromSuppressionList: RemoveFromSuppressionListUseCase,
    private readonly retryDeadLetter: RetryDeadLetterUseCase,
    @Inject(NOTIFICATION_LOG_READER) private readonly logReader: NotificationLogReader,
    @Inject(SUPPRESSION_LIST_READER) private readonly suppressionReader: SuppressionListReader,
    @Inject(NOTIFICATION_AUDIT_LOG_READER) private readonly auditReader: NotificationAuditLogReader,
  ) {}

  // 1. GET /admin/notifications/suppression-list
  @Get('suppression-list')
  async listSuppressionList(@Query() rawQuery: unknown) {
    const query = SuppressionListQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException(query.error.issues);

    const result = await this.suppressionReader.list({
      ...(query.data.reason !== undefined && { reason: query.data.reason as SuppressionReason }),
      includeRemoved: false,
      page: query.data.page,
      pageSize: query.data.pageSize,
    });
    return { ...result, page: query.data.page, pageSize: query.data.pageSize };
  }

  // 2. POST /admin/notifications/suppression-list/:id/remove
  @Post('suppression-list/:id/remove')
  @HttpCode(200)
  async removeFromSuppression(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') _idempotencyKey: string,
  ) {
    const body = RemoveSuppressionBodySchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException(body.error.issues);

    return this.removeFromSuppressionList.execute({
      id,
      actorId: req.user?.id ?? 'unknown',
      reason: body.data.reason,
    });
  }

  // 3. GET /admin/notifications/dead-letter
  @Get('dead-letter')
  async listDeadLetter(@Query() rawQuery: unknown) {
    const query = DeadLetterQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException(query.error.issues);

    const result = await this.logReader.listDeadLetter({
      ...(query.data.sourceModule !== undefined && { sourceModule: query.data.sourceModule }),
      page: query.data.page,
      pageSize: query.data.pageSize,
    });
    return { ...result, page: query.data.page, pageSize: query.data.pageSize };
  }

  // 4. POST /admin/notifications/dead-letter/:id/retry
  @Post('dead-letter/:id/retry')
  @HttpCode(200)
  async retryDeadLetterEntry(
    @Param('id') id: string,
    @Body() rawBody: unknown,
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') _idempotencyKey: string,
  ) {
    const body = RetryDeadLetterBodySchema.safeParse(rawBody);
    if (!body.success) throw new BadRequestException(body.error.issues);

    return this.retryDeadLetter.execute({
      id,
      actorId: req.user?.id ?? 'unknown',
      reason: body.data.reason,
    });
  }

  // 5. GET /admin/notifications/log/:correlationId
  @Get('log/:correlationId')
  async getLogEntry(@Param('correlationId') correlationId: string) {
    const entry = await this.logReader.findByCorrelationId(correlationId);
    if (!entry) throw new NotFoundException(`Log entry not found: ${correlationId}`);
    return entry;
  }

  // 6. GET /admin/notifications/audit
  @Get('audit')
  async listAudit(@Query() rawQuery: unknown) {
    const query = AuditQuerySchema.safeParse(rawQuery);
    if (!query.success) throw new BadRequestException(query.error.issues);

    return this.auditReader.list({
      ...(query.data.cursor !== undefined && { cursor: query.data.cursor }),
      pageSize: query.data.pageSize,
      ...(query.data.eventType !== undefined && { eventType: query.data.eventType }),
      ...(query.data.actorId !== undefined && { actorId: query.data.actorId }),
    });
  }

  // 7. GET /admin/notifications/metrics/snapshot
  @Get('metrics/snapshot')
  async metricsSnapshot(@Query('windowHours') rawHours?: string) {
    const windowHours = rawHours ? Math.max(1, Math.min(168, Number(rawHours))) : 24;
    return this.logReader.metricsSnapshot(windowHours);
  }
}
