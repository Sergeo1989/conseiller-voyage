// T094 — DeclarePermitRevokedUseCase (US3 FR-015).
//
// L'admin déclare qu'un numéro de permis d'agence n'est plus actif.
// Cascade :
//   1. Insère PermitRevocation (idempotent sur unique (permitNumber, province))
//   2. Pour chaque Affiliation déclarant ce permis :
//      a. Marque inactivatedBy='permit_revocation', inactivatedAt=now
//      b. Si la compliance perd toute affiliation valide,
//         recompute statut → si transition allowed → bascule
//   3. Émet 1 AuditEntry permit.revoked_by_admin + N entries
//      permit.cascade_applied (un par conseiller affecté)
//   4. Émet N OutboxEntry conformite.status.changed (un par bascule)

import type { ConseillerId } from '@cv/shared/conformite';
import { AdminIdSchema, PermitRevocationIdSchema } from '@cv/shared/conformite';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import type { AuthRole } from '../../../identite/application/ports/auth-session-reader.port';
import type { Affiliation } from '../../domain/entities/affiliation.entity';
import { computeConformiteStatus } from '../../domain/services/compute-conformite-status';
import { isTransitionAllowed } from '../../domain/services/is-transition-allowed';
import type { Province } from '../../domain/value-objects/province.vo';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import {
  CONFORMITE_STATUS_CACHE,
  type ConformiteStatusCache,
} from '../ports/conformite-status-cache.port';
import {
  CONFORMITE_WRITER,
  type ConformiteWriter,
  type StatusTransition,
} from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';

const MIN_REASON_LENGTH = 20;

export interface DeclarePermitRevokedInput {
  readonly requestedBy: { readonly id: string; readonly role: AuthRole };
  readonly agencyPermitNumber: string;
  readonly agencyProvince: Province;
  readonly reason: string;
}

export interface DeclarePermitRevokedOutput {
  readonly permitRevocationId: string;
  readonly affectedConseillerCount: number;
  readonly conseillerSuspensionCount: number;
}

@Injectable()
export class DeclarePermitRevokedUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
    @Inject(CONFORMITE_STATUS_CACHE) private readonly cache: ConformiteStatusCache,
  ) {}

  async execute(input: DeclarePermitRevokedInput): Promise<DeclarePermitRevokedOutput> {
    this.enforceRbac(input.requestedBy.role);
    const reason = this.validateReason(input.reason);
    const adminId = AdminIdSchema.parse(input.requestedBy.id);

    await this.assertNotAlreadyRevoked(input.agencyPermitNumber, input.agencyProvince);

    const now = this.clock.now();
    const permitRevocationId = PermitRevocationIdSchema.parse(this.uuidGenerator.generate());

    const affectedAffils = await this.findAffectedAffiliations(
      input.agencyPermitNumber,
      input.agencyProvince,
    );

    const transitions = await this.computeCascadeTransitions(affectedAffils, now);

    const auditEntries = this.buildAuditEntries(
      permitRevocationId,
      input,
      affectedAffils,
      transitions,
    );
    const outboxEntries = this.buildOutboxEntries(transitions, affectedAffils, now);

    await this.writer.declarePermitRevoked({
      permitRevocationId,
      agencyPermitNumber: input.agencyPermitNumber,
      agencyProvince: input.agencyProvince,
      revokedAt: now,
      declaredByAdminId: adminId,
      reason,
      affectedAffiliationIds: affectedAffils.map((a) => a.id),
      statusTransitions: transitions,
      auditEntries,
      outboxEntries,
    });

    // Synchronous cache invalidate per cascaded suspension (eng review issue
    // 1.1 — FR-022 negative SLO). Cascade is the worst-case fan-out for
    // Principe I exposure: a single permit pull can flip 10+ conseillers
    // simultaneously, all of whom must disappear from public consultation in
    // < 10s. Pub/sub via outbox is best-effort across processes; this DEL
    // closes the in-process gap.
    await Promise.all(
      transitions.map(async (t) => {
        const compliance = await this.reader.findComplianceById(t.conseillerComplianceId);
        if (compliance) {
          await this.cache.invalidate(compliance.conseillerId as ConseillerId);
        }
      }),
    );

    const uniqueConseillers = new Set(affectedAffils.map((a) => a.conseillerComplianceId));
    return {
      permitRevocationId,
      affectedConseillerCount: uniqueConseillers.size,
      conseillerSuspensionCount: transitions.length,
    };
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'admin') {
      throw new UnauthorizedException('Only admins can declare permit revocation.');
    }
  }

  private validateReason(raw: string): string {
    const trimmed = raw.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      throw new BadRequestException(
        `Revocation reason must be ≥ ${MIN_REASON_LENGTH} characters (FR-015).`,
      );
    }
    return trimmed;
  }

  private async assertNotAlreadyRevoked(permitNumber: string, province: Province): Promise<void> {
    const existing = await this.reader.listPermitRevocations();
    const found = existing.find(
      (r) => r.agencyPermitNumber === permitNumber && r.agencyProvince === province,
    );
    if (found) {
      throw new ConflictException(
        `Permit ${permitNumber} (${province}) already revoked at ${found.revokedAt.toISOString()}.`,
      );
    }
  }

  private async findAffectedAffiliations(
    permitNumber: string,
    province: Province,
  ): Promise<ReadonlyArray<Affiliation>> {
    // On parcourt toutes les compliances (pour MVP année 1, < 500 affiliations).
    // En production avec > 10k, ajouter un index reader dédié.
    const allCompliances = [
      ...new Set((await this.reader.listVerifiedCompliances()).map((c) => c.id).concat()),
    ];
    const allAffils: Affiliation[] = [];
    for (const compId of allCompliances) {
      const affils = await this.reader.listAffiliationsForCompliance(compId);
      for (const a of affils) {
        if (
          a.agencyPermitNumber === permitNumber &&
          a.agencyProvince === province &&
          a.inactivatedAt === null &&
          a.decision === 'approved'
        ) {
          allAffils.push(a);
        }
      }
    }
    return allAffils;
  }

  private async computeCascadeTransitions(
    affils: ReadonlyArray<Affiliation>,
    now: Date,
  ): Promise<ReadonlyArray<StatusTransition>> {
    const transitions: StatusTransition[] = [];
    const seen = new Set<string>();
    for (const affil of affils) {
      if (seen.has(affil.conseillerComplianceId)) continue;
      seen.add(affil.conseillerComplianceId);

      const compliance = await this.reader.findComplianceById(affil.conseillerComplianceId);
      if (!compliance) continue;

      const [certs, otherAffils] = await Promise.all([
        this.reader.listCertificatsForCompliance(compliance.id),
        this.reader.listAffiliationsForCompliance(compliance.id),
      ]);

      // Projette les affils affectés comme déjà inactivés
      const projectedAffils = otherAffils.map((a) =>
        affils.some((aff) => aff.id === a.id)
          ? { ...a, inactivatedAt: now, inactivatedBy: 'permit_revocation' as const }
          : a,
      );

      const newStatus = computeConformiteStatus({
        currentStatus: compliance.status,
        certificats: certs,
        affiliations: projectedAffils,
        permitRevocations: [], // déjà encodé via inactivatedAt
        now,
      });

      if (newStatus !== compliance.status && isTransitionAllowed(compliance.status, newStatus)) {
        transitions.push({
          conseillerComplianceId: compliance.id,
          from: compliance.status,
          to: newStatus,
          newLastVerifiedAt: compliance.lastVerifiedAt,
          transitionedAt: now,
        });
      }
    }
    return transitions;
  }

  private buildAuditEntries(
    permitRevocationId: string,
    input: DeclarePermitRevokedInput,
    affectedAffils: ReadonlyArray<Affiliation>,
    transitions: ReadonlyArray<StatusTransition>,
  ): ReadonlyArray<AuditEntryToCreate> {
    const correlationId = this.uuidGenerator.generate();
    const uniqueConseillers = new Set(affectedAffils.map((a) => a.conseillerComplianceId));

    const entries: AuditEntryToCreate[] = [
      {
        conseillerComplianceId: null,
        eventType: 'permit.revoked_by_admin',
        actorId: input.requestedBy.id,
        actorRole: 'admin',
        payload: {
          permitRevocationId,
          agencyPermitNumber: input.agencyPermitNumber,
          agencyProvince: input.agencyProvince,
          affectedConseillerCount: uniqueConseillers.size,
        },
        idempotencyKey: null,
        correlationId,
      },
    ];

    for (const affil of affectedAffils) {
      entries.push({
        conseillerComplianceId: affil.conseillerComplianceId,
        eventType: 'permit.cascade_applied',
        actorId: null,
        actorRole: 'system',
        payload: {
          permitRevocationId,
          affiliationId: affil.id,
        },
        idempotencyKey: null,
        correlationId,
      });
    }

    for (const t of transitions) {
      entries.push({
        conseillerComplianceId: t.conseillerComplianceId,
        eventType: 'status.changed_to_suspended',
        actorId: null,
        actorRole: 'system',
        payload: {
          previousStatus: t.from,
          newStatus: t.to,
          cause: 'permit_cascade',
        },
        idempotencyKey: null,
        correlationId,
      });
    }

    return entries;
  }

  private buildOutboxEntries(
    transitions: ReadonlyArray<StatusTransition>,
    affectedAffils: ReadonlyArray<Affiliation>,
    now: Date,
  ): ReadonlyArray<OutboxEntryToCreate> {
    const conseillerByCompliance = new Map<string, ConseillerId>();
    // On déduit le conseillerId via le compliance lookup — pour MVP on
    // utilise un placeholder ; le caller (DeclarePermitRevokedUseCase
    // pourrait l'enrichir si besoin). Ici, on émet juste l'événement.
    return transitions.map((t) => ({
      id: this.uuidGenerator.generate(),
      eventType: 'conformite.status.changed',
      payload: {
        type: 'conformite.status.changed',
        conseillerComplianceId: t.conseillerComplianceId,
        conseillerId: conseillerByCompliance.get(t.conseillerComplianceId) ?? null,
        previousStatus: t.from,
        newStatus: t.to,
        transitionKind: 'negative',
        cause: 'permit_cascade',
        occurredAt: now.toISOString(),
        affectedAffiliationIds: affectedAffils
          .filter((a) => a.conseillerComplianceId === t.conseillerComplianceId)
          .map((a) => a.id),
      },
    }));
  }
}
