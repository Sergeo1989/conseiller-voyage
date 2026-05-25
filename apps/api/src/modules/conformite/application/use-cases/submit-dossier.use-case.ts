// T051 — SubmitDossierUseCase.
// Soumission d'un dossier complet par un conseiller :
//   1. RBAC : seul role=conseiller (Principe IX).
//   2. Validation métier via validateDossierSubmission (T047).
//   3. Vérification de chaque UploadIntent (B2) : existence, propriété,
//      non consommé, non expiré, purpose cohérent.
//   4. Écriture transactionnelle unique (B1 outbox) : Submission +
//      Certificats + Affiliations + AuditEntry + OutboxEntry.
// Cf. spec FR-001/FR-016/FR-021 + data-model.md + research.md R7/R10.

import {
  type AffiliationId,
  AffiliationIdSchema,
  type CertificatId,
  CertificatIdSchema,
  type ConseillerId,
  type SubmissionId,
  SubmissionIdSchema,
  type UploadIntentId,
  UploadIntentIdSchema,
} from '@cv/shared/conformite';
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
import type { UploadIntent, UploadPurpose } from '../../domain/entities/upload-intent.entity';
import type { AuditEntryToCreate } from '../ports/audit-log-writer.port';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';
import {
  CONFORMITE_WRITER,
  type ConformiteWriter,
  type SubmitAffiliationArgs,
  type SubmitCertificateArgs,
} from '../ports/conformite-writer.port';
import type { OutboxEntryToCreate } from '../ports/outbox-writer.port';
import {
  type DossierSubmissionAffiliationInput,
  type DossierSubmissionCertificateInput,
  type DossierSubmissionInput,
  type ValidationFailure,
  validateDossierSubmission,
} from '../validate-dossier-submission';

export interface SubmitDossierInput {
  readonly requestedBy: { readonly id: ConseillerId; readonly role: AuthRole };
  readonly dossier: DossierSubmissionInput;
}

export interface SubmitDossierOutput {
  readonly submissionId: SubmissionId;
}

interface UploadIntentRequirement {
  readonly uploadIntentId: UploadIntentId;
  readonly expectedPurpose: UploadPurpose;
  readonly indexLabel: string;
}

@Injectable()
export class SubmitDossierUseCase {
  constructor(
    @Inject(CONFORMITE_READER) private readonly reader: ConformiteReader,
    @Inject(CONFORMITE_WRITER) private readonly writer: ConformiteWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuidGenerator: UuidGenerator,
  ) {}

  async execute(input: SubmitDossierInput): Promise<SubmitDossierOutput> {
    this.enforceRbac(input.requestedBy.role);

    const validation = validateDossierSubmission(input.dossier);
    if (!validation.success) {
      throw new BadRequestException(this.formatValidationErrors(validation.errors));
    }

    const now = this.clock.now();
    const compliance = await this.writer.getOrCreateCompliance({
      conseillerId: input.requestedBy.id,
      now,
    });

    const intents = await this.resolveAndVerifyIntents(input.dossier, compliance.id, now);

    const submissionId = SubmissionIdSchema.parse(this.uuidGenerator.generate());
    const certificates = this.buildCertificateArgs(input.dossier.certificates, intents);
    const affiliations = this.buildAffiliationArgs(input.dossier.affiliations, intents);

    const auditEntries: ReadonlyArray<AuditEntryToCreate> = [
      {
        conseillerComplianceId: compliance.id,
        eventType: 'dossier.submitted',
        actorId: input.requestedBy.id,
        actorRole: 'conseiller',
        payload: {
          submissionId,
          certificateCount: certificates.length,
          affiliationCount: affiliations.length,
        },
        idempotencyKey: null,
        correlationId: submissionId,
      },
    ];

    const outboxEntries: ReadonlyArray<OutboxEntryToCreate> = [
      {
        id: this.uuidGenerator.generate(),
        eventType: 'conformite.dossier.submitted',
        payload: {
          type: 'conformite.dossier.submitted',
          conseillerId: input.requestedBy.id,
          submissionId,
          certificateCount: certificates.length,
          affiliationCount: affiliations.length,
          occurredAt: now.toISOString(),
        },
      },
    ];

    await this.writer.submitDossier({
      conseillerComplianceId: compliance.id,
      submissionId,
      submittedAt: now,
      consentGiven: input.dossier.consentGiven,
      certificates,
      affiliations,
      auditEntries,
      outboxEntries,
    });

    return { submissionId };
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'conseiller') {
      throw new UnauthorizedException('Only conseillers can submit a dossier (Principe IX).');
    }
  }

  private formatValidationErrors(errors: ReadonlyArray<ValidationFailure>): {
    message: string;
    errors: ReadonlyArray<ValidationFailure>;
  } {
    return {
      message: 'Dossier validation failed.',
      errors,
    };
  }

  private async resolveAndVerifyIntents(
    dossier: DossierSubmissionInput,
    conseillerComplianceId: string,
    now: Date,
  ): Promise<Map<UploadIntentId, UploadIntent>> {
    const requirements = this.collectRequirements(dossier);
    const resolved = new Map<UploadIntentId, UploadIntent>();

    for (const requirement of requirements) {
      const intent = await this.reader.findUploadIntent(requirement.uploadIntentId);
      this.verifyIntent(intent, requirement, conseillerComplianceId, now);
      // Non-null assertion safe : verifyIntent throws if intent === null.
      resolved.set(requirement.uploadIntentId, intent as UploadIntent);
    }

    return resolved;
  }

  private collectRequirements(dossier: DossierSubmissionInput): UploadIntentRequirement[] {
    const reqs: UploadIntentRequirement[] = [];
    for (const [i, cert] of dossier.certificates.entries()) {
      reqs.push({
        uploadIntentId: this.parseUploadId(cert.documentUploadId, `certificates[${i}]`),
        expectedPurpose: 'certificat',
        indexLabel: `certificates[${i}]`,
      });
    }
    for (const [i, affil] of dossier.affiliations.entries()) {
      reqs.push({
        uploadIntentId: this.parseUploadId(affil.proofUploadId, `affiliations[${i}]`),
        expectedPurpose: 'preuve_affiliation',
        indexLabel: `affiliations[${i}]`,
      });
    }
    return reqs;
  }

  private parseUploadId(rawId: string, label: string): UploadIntentId {
    const parsed = UploadIntentIdSchema.safeParse(rawId);
    if (!parsed.success) {
      throw new BadRequestException(`${label}.uploadId is not a valid UUID.`);
    }
    return parsed.data;
  }

  private verifyIntent(
    intent: UploadIntent | null,
    req: UploadIntentRequirement,
    conseillerComplianceId: string,
    now: Date,
  ): void {
    if (!intent) {
      throw new BadRequestException(
        `${req.indexLabel}: uploadId ${req.uploadIntentId} not found (B2).`,
      );
    }
    if (intent.conseillerComplianceId !== conseillerComplianceId) {
      throw new UnauthorizedException(
        `${req.indexLabel}: uploadId does not belong to this conseiller (B2).`,
      );
    }
    if (intent.consumedAt !== null) {
      throw new ConflictException(`${req.indexLabel}: uploadId already consumed (B2).`);
    }
    if (intent.expiresAt <= now) {
      throw new BadRequestException(`${req.indexLabel}: uploadId expired (B2).`);
    }
    if (intent.purpose !== req.expectedPurpose) {
      throw new BadRequestException(
        `${req.indexLabel}: uploadId purpose mismatch (expected "${req.expectedPurpose}", got "${intent.purpose}").`,
      );
    }
  }

  private buildCertificateArgs(
    certs: ReadonlyArray<DossierSubmissionCertificateInput>,
    intents: Map<UploadIntentId, UploadIntent>,
  ): ReadonlyArray<SubmitCertificateArgs> {
    return certs.map((cert) => {
      const uploadIntentId = this.parseUploadId(cert.documentUploadId, 'certificates');
      const intent = intents.get(uploadIntentId);
      if (!intent) throw new Error('unreachable: intent already verified');
      const id: CertificatId = CertificatIdSchema.parse(this.uuidGenerator.generate());
      return {
        id,
        province: cert.province,
        certificateNumber: cert.certificateNumber,
        issuedAt: cert.issuedAt,
        expiresAt: cert.expiresAt,
        documentObjectKey: intent.objectKey,
        uploadIntentId,
      };
    });
  }

  private buildAffiliationArgs(
    affils: ReadonlyArray<DossierSubmissionAffiliationInput>,
    intents: Map<UploadIntentId, UploadIntent>,
  ): ReadonlyArray<SubmitAffiliationArgs> {
    return affils.map((affil) => {
      const uploadIntentId = this.parseUploadId(affil.proofUploadId, 'affiliations');
      const intent = intents.get(uploadIntentId);
      if (!intent) throw new Error('unreachable: intent already verified');
      const id: AffiliationId = AffiliationIdSchema.parse(this.uuidGenerator.generate());
      return {
        id,
        agencyName: affil.agencyName,
        agencyPermitNumber: affil.agencyPermitNumber,
        agencyProvince: affil.agencyProvince,
        proofObjectKey: intent.objectKey,
        uploadIntentId,
        role: affil.role ?? null,
        activeSince: affil.activeSince ?? null,
      };
    });
  }
}
