# Contract — Port public `LegalAcceptanceFacade`

**Module fournisseur** : `identité`

**Modules consommateurs** : `002-voyageur-intake` (au moment de la soumission du brief).

**Localisation** : `apps/api/src/modules/identite/interface/public-api/legal-acceptance.facade.ts`

---

## Interface

```typescript
export interface LegalAcceptanceFacade {
  /**
   * Enregistre une acceptation pour un brief voyageur anonyme.
   * Appelé par le module 002 dans la même transaction Prisma que la
   * création du brief — Loi 25 art. 8 (consentement granulaire, horodaté,
   * traçable).
   *
   * Idempotent : si une acceptance existe déjà pour
   * (briefId, documentType, documentVersion), retourne l'existante sans
   * lever d'exception (cas de retry interne ou rejeu de submit).
   */
  acceptForBrief(input: AcceptForBriefInput): Promise<LegalAcceptanceRecord>;

  /**
   * Récupère la version courante (la plus récente non supersédée) d'un
   * type de document. Utilisé par le module 002 pour afficher le numéro
   * de version au moment du brief, et pour transmettre la même valeur
   * dans l'acceptance.
   */
  getCurrentVersion(documentType: LegalDocumentType): Promise<number>;
}

export interface AcceptForBriefInput {
  readonly briefId: BriefId;
  readonly documentType: 'confidentialite' | 'cgu_b2c';
  readonly documentVersion: number;
  readonly acceptedAt: Date;
  readonly ipAddress: string;
  readonly userAgent: string;
}

export interface LegalAcceptanceRecord {
  readonly id: LegalAcceptanceId;
  readonly briefId: BriefId;
  readonly documentType: 'confidentialite' | 'cgu_b2c';
  readonly documentVersion: number;
  readonly acceptedAt: Date;
}
```

---

## Garanties

1. **Idempotence** : appel répété avec les mêmes
   `(briefId, documentType, documentVersion)` retourne la même
   `LegalAcceptanceRecord` (lookup avant insert, ou capture du conflit
   unique côté Prisma).
2. **Atomicité** : si le module 002 appelle `acceptForBrief` deux fois
   dans la même transaction Prisma (une pour `confidentialite`, une
   pour `cgu_b2c`), les deux inserts soit réussissent ensemble, soit
   échouent ensemble (rollback géré par Prisma).
3. **Version vérifiée** : `acceptForBrief` valide en interne que
   `documentVersion` correspond bien à une `LegalDocument` existante et
   non supersédée. Si version inconnue → exception
   `UnknownLegalDocumentVersionError`.
4. **Validation Zod** : tous les inputs passent par Zod côté façade
   (`packages/legal/src/schemas.ts`) — pas de confiance en l'appelant.
5. **Pas d'écriture si version supersédée** : si la version pointée a
   `supersededBy != null`, exception `LegalDocumentSupersededError`. Le
   module 002 doit toujours utiliser `getCurrentVersion` pour récupérer
   la version active.

---

## Exemples d'usage (depuis le module 002)

```typescript
// Dans 002 : SubmitBriefUseCase

const intakeConfidentialiteVersion = await this.legalAcceptanceFacade.getCurrentVersion('confidentialite');
const cguB2cVersion = await this.legalAcceptanceFacade.getCurrentVersion('cgu_b2c');

// Affichage UI : numéros de version stockés côté state du formulaire

// Submit : dans la transaction Prisma qui crée le brief
await this.prisma.$transaction(async (tx) => {
  const brief = await tx.brief.create({ data: { ... } });
  await this.legalAcceptanceFacade.acceptForBrief({
    briefId: brief.id,
    documentType: 'confidentialite',
    documentVersion: intakeConfidentialiteVersion,
    acceptedAt: now,
    ipAddress: requestIp,
    userAgent: requestUserAgent,
  });
  await this.legalAcceptanceFacade.acceptForBrief({
    briefId: brief.id,
    documentType: 'cgu_b2c',
    documentVersion: cguB2cVersion,
    acceptedAt: now,
    ipAddress: requestIp,
    userAgent: requestUserAgent,
  });
});
```

---

## Tests de contrat

Le module 002 **doit** inclure un test de contrat
(`apps/api/test/contract/legal-acceptance.contract.test.ts`) qui :

1. Appelle `acceptForBrief` avec un `briefId` factice et vérifie le
   payload de retour.
2. Appelle `acceptForBrief` deux fois avec les mêmes paramètres et
   vérifie que la deuxième n'insère pas (lookup, pas d'erreur).
3. Appelle `getCurrentVersion('cgu_b2c')` et vérifie qu'elle retourne
   un entier > 0.
4. Appelle `acceptForBrief` avec une `documentVersion` invalide et
   vérifie l'exception `UnknownLegalDocumentVersionError`.
5. Appelle `acceptForBrief` avec une version supersédée et vérifie
   l'exception `LegalDocumentSupersededError`.

Cohérent avec le pattern `ConformiteQueryPort` livré en 001.
