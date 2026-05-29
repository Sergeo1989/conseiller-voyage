// T054 [US1] — PrismaIntakeAuditLogWriter (append-only).
//
// Le trigger SQL `intake_audit_block_modifications` (T014) bloque tout
// UPDATE/DELETE/TRUNCATE côté DB. Ce writer n'utilise que INSERT.
//
// Pattern hérité de PrismaAuditLogWriter (001) — validation côté code
// minimale (les schémas payload viendront en Phase 8 polish si besoin).

import { prisma } from '@cv/db';
import type { ActorRole } from '@cv/db';
import { Injectable } from '@nestjs/common';
import type { IntakeAuditEntryInput, IntakeAuditLogWriter } from '../application/ports';

// Mapping role applicatif intake → enum ActorRole (réutilisé du module
// conformite via la migration 001). L'enum ActorRole côté Prisma contient
// 'conseiller', 'admin', 'system'. Pour 'voyageur', on mappe vers 'system'
// (l'utilisateur n'a pas de compte). TODO Phase 8 : étendre l'enum si
// le besoin d'un acteur 'voyageur' distinct se confirme.
const ROLE_MAPPING: Record<string, ActorRole> = {
  voyageur: 'system',
  admin: 'admin',
  system: 'system',
  conseiller: 'conseiller',
};

@Injectable()
export class PrismaIntakeAuditLogWriter implements IntakeAuditLogWriter {
  async append(entry: IntakeAuditEntryInput): Promise<void> {
    await prisma.intakeAuditEntry.create({
      data: {
        id: entry.id,
        voyageurBriefId: entry.voyageurBriefId,
        voyageurContactId: entry.voyageurContactId,
        eventType: entry.eventType,
        actorRole: ROLE_MAPPING[entry.actorRole] ?? 'system',
        actorId: entry.actorId,
        occurredAt: entry.occurredAt,
        payload: entry.payload as object,
        idempotencyKey: entry.idempotencyKey,
        correlationId: entry.correlationId,
      },
    });
  }
}
