// T108 — ViewConseillerDossierUseCase (US5 FR-013).
//
// Lecture du dossier complet du conseiller authentifié + historique
// d'audit paginé curseur. Le composant historique côté front (T110)
// affiche les 20 derniers événements avec dates FR-CA + avertissement
// renouvellement si un cert expire dans 30 jours.

import type { ConseillerId } from '@cv/shared/conformite';
import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { AuthRole } from '../../../identite/application/ports/auth-session-reader.port';
import type { Affiliation } from '../../domain/entities/affiliation.entity';
import type { Certificat } from '../../domain/entities/certificat.entity';
import type { ConseillerCompliance } from '../../domain/entities/conseiller-compliance.entity';
import { CONFORMITE_READER, type ConformiteReader } from '../ports/conformite-reader.port';

const DEFAULT_AUDIT_PAGE_SIZE = 20;

export interface ViewConseillerDossierInput {
  readonly requestedBy: { readonly id: ConseillerId; readonly role: AuthRole };
  readonly auditCursor?: string | null;
  readonly auditPageSize?: number;
}

export interface ViewConseillerDossierOutput {
  readonly compliance: ConseillerCompliance;
  readonly certificates: ReadonlyArray<Certificat>;
  readonly affiliations: ReadonlyArray<Affiliation>;
  readonly audit: {
    readonly items: ReadonlyArray<{
      readonly id: string;
      readonly eventType: string;
      readonly actorRole: 'conseiller' | 'admin' | 'system';
      readonly occurredAt: Date;
      readonly payload: Record<string, unknown>;
    }>;
    readonly nextCursor: string | null;
  };
}

@Injectable()
export class ViewConseillerDossierUseCase {
  constructor(@Inject(CONFORMITE_READER) private readonly reader: ConformiteReader) {}

  async execute(input: ViewConseillerDossierInput): Promise<ViewConseillerDossierOutput> {
    this.enforceRbac(input.requestedBy.role);

    const compliance = await this.reader.findComplianceByConseillerId(input.requestedBy.id);
    if (!compliance) {
      throw new NotFoundException('Aucun dossier de conformité trouvé.');
    }
    if (compliance.anonymizedAt !== null) {
      throw new NotFoundException('Dossier anonymisé (Loi 25).');
    }

    const pageSize = input.auditPageSize ?? DEFAULT_AUDIT_PAGE_SIZE;

    const [certificates, affiliations, audit] = await Promise.all([
      this.reader.listCertificatsForCompliance(compliance.id),
      this.reader.listAffiliationsForCompliance(compliance.id),
      this.reader.listAuditEntriesForCompliance({
        conseillerComplianceId: compliance.id,
        cursor: input.auditCursor ?? null,
        pageSize,
      }),
    ]);

    return { compliance, certificates, affiliations, audit };
  }

  private enforceRbac(role: AuthRole): void {
    if (role !== 'conseiller') {
      throw new UnauthorizedException('Reserved to conseillers.');
    }
  }
}
