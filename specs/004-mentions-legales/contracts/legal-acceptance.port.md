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
2. **Atomicité interne** : `acceptForBrief` encapsule sa propre
   transaction Prisma côté module `identité` — l'appelant **ne passe
   jamais** son client Prisma. Si l'insert échoue, la façade rollback
   en interne et remonte une exception typée. Le module 002 gère son
   propre lifecycle de brief en dehors (cf. research R7 — décision
   Alt 2).
3. **Pas de partage de client Prisma cross-module** (Principe V) : la
   façade respecte la frontière modulaire en gérant sa propre
   persistance. C'est l'appelant qui orchestre la séquence — pas la
   transaction.
4. **Version vérifiée** : `acceptForBrief` valide en interne que
   `documentVersion` correspond bien à une `LegalDocument` existante et
   effective (`effectiveAt <= now()`). Si version inconnue ou pas encore
   effective → exception `UnknownLegalDocumentVersionError`.
5. **Validation Zod** : tous les inputs passent par Zod côté façade
   (`packages/legal/src/schemas.ts`) — pas de confiance en l'appelant.
6. **Pas d'écriture si version obsolète** : si une version plus récente
   est devenue effective, l'acceptation reste valide pour le
   `documentVersion` demandé (cas voyageur : il accepte la version qu'on
   lui a affichée). Mais en pratique, le module 002 doit appeler
   `getCurrentVersion` juste avant et passer la valeur retournée pour
   éviter les races.

---

## Exemples d'usage (depuis le module 002)

Pattern alt 2 de research R7 — lifecycle de brief, façade encapsule sa
propre transaction, pas de partage de client Prisma.

```typescript
// Dans 002 : SubmitBriefUseCase

// 1. Pré-récupérer les versions courantes (à afficher dans l'UI)
const intakeConfidentialiteVersion = await this.legalAcceptanceFacade.getCurrentVersion('confidentialite');
const cguB2cVersion = await this.legalAcceptanceFacade.getCurrentVersion('cgu_b2c');

// ... (affichage UI, validation Zod côté form) ...

async function submitBrief(input: SubmitBriefInput): Promise<SubmissionResult> {
  // 2. Créer le brief en consent_pending (transaction interne 002)
  const brief = await this.briefWriter.create({
    ...input,
    status: 'consent_pending',
  });

  try {
    // 3. Enregistrer les deux acceptations via la façade (chaque appel = transaction interne identité)
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

    // 4. Marquer le brief comme consent_ok puis submitted (transaction interne 002)
    await this.briefWriter.transition(brief.id, 'consent_pending', 'consent_ok');
    await this.briefWriter.transition(brief.id, 'consent_ok', 'submitted');

    return { briefId: brief.id, status: 'submitted' };
  } catch (err) {
    // 5. Si une acceptance échoue, le brief reste consent_pending.
    //    Le job OrphanBriefCleanupJob (BullMQ quotidien) le marquera
    //    consent_failed après 1 heure. Pas de rollback synchrone à faire.
    this.logger.error({ briefId: brief.id, err }, 'acceptForBrief failed; brief left in consent_pending');
    throw err;
  }
}
```

### États du brief

```text
created → consent_pending → consent_ok → submitted → ...
                ↓
          consent_failed (orphan cleanup, > 1h sans transition)
```

Seuls les briefs en état `submitted` sont visibles côté matching. Les
états `consent_pending` et `consent_failed` sont invisibles
publiquement.

---

## Tests de contrat

Le test de contrat **vit dans 004** (pas dans 002), pour permettre la
validation indépendante du contrat avant que 002 ne soit livré.
Localisation : `apps/api/test/contract/legal-acceptance.contract.test.ts`.
Pattern cohérent avec `ConformiteQueryPort` livré en 001
(`conformite-query.contract.test.ts`).

Le test simule un consommateur (rôle joué par le test) qui :

1. Appelle `getCurrentVersion('cgu_b2c')` et vérifie qu'elle retourne
   un entier > 0 (la version seed initiale).
2. Appelle `acceptForBrief` avec un `briefId` factice et la version
   courante, vérifie le payload de retour.
3. Appelle `acceptForBrief` une 2e fois avec les mêmes paramètres et
   vérifie que la 2e appel est idempotent (pas d'erreur, retour
   identique, count de rows inchangé).
4. Appelle `acceptForBrief` avec une `documentVersion` invalide et
   vérifie l'exception `UnknownLegalDocumentVersionError`.
5. Appelle `acceptForBrief` avec une version connue mais
   `effectiveAt > now()` et vérifie l'exception
   `UnknownLegalDocumentVersionError` (version pas encore effective).
6. **Test de la non-fuite de transaction** : vérifie qu'aucune méthode
   du contrat n'expose un type Prisma ou un client transactionnel.
   Cohérent avec l'invariant de R7 (Alt 2).

Le test contractuel produit également une fixture JSON snapshot du
contrat (chemin, signature des méthodes, types d'exceptions exposées)
versionnée dans le repo. Tout changement de signature non
intentionnel échoue le test → re-publication explicite obligatoire.
