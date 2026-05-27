// T092 — AnonymizeLegalAcceptancesUseCase (Phase N Polish, Loi 25).
//
// Pour un sujet donné (conseiller ou brief), liste toutes ses acceptances
// et insère une row d'anonymisation pour chacune dans la table séparée
// `auth_legal_acceptance_anonymizations` (append-only).
//
// Pattern (ADR-0008) : les rows originales `LegalAcceptance` ne sont
// JAMAIS modifiées (trigger DB BEFORE UPDATE/DELETE bloque). Les
// projections de lecture font un LEFT JOIN qui masque les champs PII si
// une anonymisation existe.
//
// Idempotent par contrainte unique DB `(acceptanceId)` côté repository :
// si une row d'anonymisation existe déjà pour une acceptance donnée, le
// repository skip silencieusement (try/catch P2002 logged en warning).

import { LegalAcceptanceAnonymizationIdSchema } from '@cv/legal';
// Import via subpath — `anonymization` utilise `node:crypto` (createHash)
// donc n'est pas réexporté depuis `@cv/legal/index.ts` pour préserver la
// compatibilité Edge runtime du middleware Next.js.
import { extractBrowserFamily, hashSubjectId, maskIpAddress } from '@cv/legal/anonymization';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../../common/ports/clock.port';
import { UUID_GENERATOR, type UuidGenerator } from '../../../../common/ports/uuid-generator.port';
import {
  LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER,
  type LegalAcceptanceAnonymizationWriter,
} from '../ports/legal-acceptance-anonymization-writer.port';
import {
  LEGAL_ACCEPTANCE_READER,
  type LegalAcceptanceReader,
} from '../ports/legal-acceptance-reader.port';

export interface AnonymizeLegalAcceptancesInput {
  readonly subjectId: string;
  /**
   * Salt à utiliser pour `hashSubjectId`. Injecté par le caller — vient
   * d'AWS Secrets Manager via env. Permet de tester sans accès au vrai
   * secret.
   */
  readonly anonymizationSalt: string;
  /**
   * Version du salt (incrémentée si rotation d'urgence — ADR-0008).
   * Stockée sur la row pour permettre une re-anonymisation si le salt
   * a changé. Défaut 1.
   */
  readonly anonymizationSaltVersion?: number;
}

export interface AnonymizeLegalAcceptancesResult {
  readonly anonymizedCount: number;
}

export const ANONYMIZATION_SALT_TOKEN = Symbol.for('Loi25AnonymizationSalt');

@Injectable()
export class AnonymizeLegalAcceptancesUseCase {
  private readonly logger = new Logger(AnonymizeLegalAcceptancesUseCase.name);

  constructor(
    @Inject(LEGAL_ACCEPTANCE_READER) private readonly reader: LegalAcceptanceReader,
    @Inject(LEGAL_ACCEPTANCE_ANONYMIZATION_WRITER)
    private readonly writer: LegalAcceptanceAnonymizationWriter,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UUID_GENERATOR) private readonly uuids: UuidGenerator,
  ) {}

  async execute(input: AnonymizeLegalAcceptancesInput): Promise<AnonymizeLegalAcceptancesResult> {
    const now = this.clock.now();
    const acceptances = await this.reader.listBySubject(input.subjectId);
    const saltVersion = input.anonymizationSaltVersion ?? 1;
    const subjectHash = hashSubjectId(input.subjectId, input.anonymizationSalt);
    let count = 0;

    for (const entry of acceptances) {
      // listBySubject retourne déjà des LegalAcceptanceWithAnonymization —
      // skip si déjà anonymisée (idempotence).
      if (entry.anonymization !== null) {
        continue;
      }
      try {
        await this.writer.insertAnonymization({
          id: LegalAcceptanceAnonymizationIdSchema.parse(this.uuids.generate()),
          acceptanceId: entry.acceptance.id,
          subjectIdHash: subjectHash,
          ipAddressMasked: maskIpAddress(entry.acceptance.ipAddress),
          userAgentFamily: extractBrowserFamily(entry.acceptance.userAgent),
          anonymizedAt: now,
          anonymizationSaltVersion: saltVersion,
        });
        count += 1;
      } catch (err) {
        this.logger.warn(
          `Anonymization skipped for acceptance ${entry.acceptance.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { anonymizedCount: count };
  }
}

export const ANONYMIZE_LEGAL_ACCEPTANCES_USE_CASE = Symbol.for('AnonymizeLegalAcceptancesUseCase');
