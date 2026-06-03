# Contract — `MatchingQueryPort`

**Module publisher** : `matching`
**Consommateurs** : `matching` (012 notifications futures), `intake` (admin US5 extension), feature 015 espace voyageur post-intake
**Package shared** : `@cv/shared/matching`

Port public exposé par le module `matching` pour permettre aux autres modules de lire (jamais d'écrire) les `MatchingResult`. Conforme Principe V (interfaces étroites, imports cross-module uniquement via cette interface).

## Symbol DI

```typescript
export const MATCHING_QUERY_PORT = Symbol.for('MATCHING_QUERY_PORT');
```

## Interface

```typescript
import type { VoyageurBriefId, ConseillerId } from '@cv/shared/intake';
import type { MatchingResultId } from './branded-ids';

export interface MatchingQueryPort {
  /**
   * Lit le MatchingResult actif (non superseded) pour un brief donné.
   * Filtre dynamiquement les conseillers ayant perdu leur statut verified
   * après le calcul (FR-015 — aucun non-verified jamais exposé au voyageur).
   *
   * @returns null si aucun matching encore calculé pour ce brief
   *          (status pending_verification ou jamais activé)
   *
   * @throws never — toute erreur DB est encapsulée en exception
   *         applicative dédiée par l'adapter
   */
  getByBriefIdForVoyageur(
    briefId: VoyageurBriefId,
  ): Promise<MatchingResultPublicView | null>;

  /**
   * Lit le MatchingResult actif pour un brief, vue admin SANS le filtre
   * dynamique verified (l'admin doit voir l'état historique exact, y compris
   * les conseillers révoqués).
   *
   * @returns null si aucun matching pour ce brief
   */
  getByBriefIdForAdmin(
    briefId: VoyageurBriefId,
  ): Promise<MatchingResultAdminView | null>;

  /**
   * Liste les briefs dont les 3 conseillers du top 3 ont tous perdu leur
   * statut verified (cas FR-016, signalé pour re-matching manuel admin).
   *
   * @param sinceMs — ne lister que les MR dont la dernière révocation est postérieure
   * @returns liste possiblement vide
   */
  listBriefsWithAllMatchesRevoked(sinceMs: number): Promise<ReadonlyArray<BriefRevocationSummary>>;
}

export type MatchingResultPublicView = Readonly<{
  matchingResultId: MatchingResultId;
  briefId: VoyageurBriefId;
  status: 'ok' | 'partial' | 'empty';
  matchedCount: 0 | 1 | 2 | 3;
  entries: ReadonlyArray<MatchingResultPublicEntry>;  // verified dynamique appliqué
  computedAt: Date;
  algorithmVersion: string;
}>;

export type MatchingResultPublicEntry = Readonly<{
  position: 1 | 2 | 3;
  conseillerId: ConseillerId;
  // scoreBrut / scoreFinal / scoreComponents JAMAIS exposés au voyageur (signal interne)
}>;

export type MatchingResultAdminView = Readonly<{
  matchingResultId: MatchingResultId;
  briefId: VoyageurBriefId;
  status: 'ok' | 'partial' | 'empty';
  matchedCount: 0 | 1 | 2 | 3;
  entries: ReadonlyArray<MatchingResultAdminEntry>;
  computedAt: Date;
  algorithmVersion: string;
  supersededAt: Date | null;
  supersededByMatchingResultId: MatchingResultId | null;
  boostApplied: boolean;
  suggestedConseillerId: ConseillerId | null;
}>;

export type MatchingResultAdminEntry = Readonly<{
  position: 1 | 2 | 3;
  conseillerId: ConseillerId;
  scoreBrut: number;          // [0.0, 1.0]
  scoreFinal: number;         // [0.0, 1.1]
  scoreComponents: Readonly<{
    destination: number;
    geo: number;
    speciality: number;
    familiarity: number;
  }>;
  boosted: boolean;
  currentVerifiedStatus: 'verified' | 'revoked' | 'expired' | 'unknown';
}>;

export type BriefRevocationSummary = Readonly<{
  briefId: VoyageurBriefId;
  matchingResultId: MatchingResultId;
  computedAt: Date;
  lastRevocationAt: Date;
  revokedConseillerCount: number; // 1, 2 ou 3
}>;
```

## Sémantique

- **Filtrage dynamique verified** : `getByBriefIdForVoyageur` consulte `ConformiteQueryPort.getVerificationStatus` pour chaque conseiller du top 3 et exclut ceux non-verified au moment de la lecture (FR-015). Le `MatchingResult` original n'est pas modifié (append-only Loi 25 + audit).
- **Vue admin sans filtre** : `getByBriefIdForAdmin` retourne l'état historique exact + le statut courant de chaque conseiller (`currentVerifiedStatus`). Permet à l'admin de comprendre pourquoi un MR est exposé partiellement / vide.
- **Anonymisation Loi 25** : si le brief a été anonymisé, `briefId` aura été null-é côté DB par le trigger cascade ; les deux méthodes retournent alors `null` (pas de fuite PII).

## Implémentation

L'adapter `PrismaMatchingQueryAdapter` (dans `apps/api/src/modules/matching/infrastructure/`) :

1. Lit le MR via `prisma.matchingResult.findFirst({ where: { briefId, supersededAt: null } })`.
2. Pour `getByBriefIdForVoyageur` : pour chaque entry, appelle `ConformiteQueryPort.getVerificationStatus(conseillerId)` ; n'inclut que les `verified`.
3. Pour `getByBriefIdForAdmin` : tout inclure + ajouter `currentVerifiedStatus`.

## Tests d'invariant requis

- `getByBriefIdForVoyageur` ne retourne jamais un conseiller non-verified au moment de la lecture.
- `getByBriefIdForVoyageur` retourne `null` pour un brief anonymisé.
- `getByBriefIdForAdmin` retourne le snapshot historique même si tous les conseillers sont révoqués.
- Aucune des deux méthodes ne modifie quoi que ce soit en DB (read-only).
