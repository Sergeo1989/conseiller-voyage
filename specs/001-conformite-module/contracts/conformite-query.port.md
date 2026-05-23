# Contrat : `ConformiteQueryPort`

**Type** : Port public du module conformité, consommé par tous les autres modules.

**Localisation** : déclaré dans `packages/shared/conformite/contracts.ts`,
implémenté par `apps/api/src/modules/conformite/interface/public-api/conformite-query.facade.ts`.

**Source de spec** : FR-006, FR-007, FR-022, SC-010.

---

## Contrat TypeScript

```ts
// packages/shared/conformite/contracts.ts

export type ConseillerId = string & { readonly __brand: 'ConseillerId' };

export interface VerificationStatusResponse {
  /** Identifiant interne du conseiller. */
  conseillerId: ConseillerId;
  /** Statut binaire publié à l'extérieur du module. Aucun détail d'état interne ne fuit. */
  verified: boolean;
  /** Horodatage de la dernière vérification réussie. Null si jamais vérifié. */
  lastVerifiedAt: Date | null;
  /** Indique si le module conformité a effectivement trouvé le conseiller. */
  found: boolean;
}

export interface ConformiteQueryPort {
  /**
   * Consultation unitaire. Cache 60s par défaut.
   * Si `strict` est `true`, bypass cache et lecture DB directe — utiliser
   * uniquement quand le risque réglementaire est immédiat (matching qui
   * va envoyer un lead à un conseiller).
   */
  getVerificationStatus(
    conseillerId: ConseillerId,
    options?: { strict?: boolean }
  ): Promise<VerificationStatusResponse>;

  /**
   * Consultation par lot, optimisée pour les listes (annuaire SEO, file de matching).
   * Cache identique. Retourne une map indexée par conseillerId.
   */
  getVerificationStatusBatch(
    conseillerIds: ReadonlyArray<ConseillerId>,
    options?: { strict?: boolean }
  ): Promise<ReadonlyMap<ConseillerId, VerificationStatusResponse>>;

  /**
   * Souscription à un flux d'événements de changement de statut.
   * Utilisé par les modules qui maintiennent un cache local
   * (ex: matching qui veut être notifié des révocations < 10s).
   */
  subscribe(handler: (event: ConformiteStatusChangedEvent) => void): Unsubscribe;
}

export type Unsubscribe = () => void;

export interface ConformiteStatusChangedEvent {
  conseillerId: ConseillerId;
  /** Nouveau statut binaire publié. */
  verifiedAfter: boolean;
  /** Horodatage du changement. */
  occurredAt: Date;
  /** Indication facultative du type de transition pour le routing du consommateur. */
  transitionKind: 'positive' | 'negative';
}
```

---

## Contraintes de comportement

### Latence (spec FR-022, SC-010)

| Scénario | Cible |
|---|---|
| `getVerificationStatus` non strict, cache HIT | p95 < 5 ms |
| `getVerificationStatus` non strict, cache MISS | p95 < 50 ms |
| `getVerificationStatus` strict (bypass cache) | p95 < 100 ms |
| Propagation d'un changement de statut au consommateur (via `subscribe`) | < 1 s nominal, < 10 s pire cas |
| Délai max entre changement de statut et lecture cohérente même en cache | < 60 s général, < 10 s pour transitions négatives |

### Sécurité

- Aucun appel ne révèle de PII : la réponse contient l'ID conseiller et un
  booléen. Aucun nom, adresse, numéro de certificat.
- L'accès au port est restreint aux modules de la même application
  (in-process). Aucun endpoint HTTP externe n'expose ce port. Si à l'avenir
  un module externe a besoin, une exposition explicite via une route
  authentifiée + API key sera ajoutée par un nouveau spec.

### Idempotence

- Lectures pures, idempotentes par nature.
- Pas de header `Idempotency-Key` requis (pas d'effet de bord).

### Modes dégradés

- **Cache Redis HS** : fallback lecture DB directe (perte de performance,
  pas de perte de correction).
- **DB HS** : retourne `{ found: false, verified: false, lastVerifiedAt: null }`.
  Le consommateur traite ce cas comme « non vérifié » par défaut (fail-safe
  vers le strict Principe I).

---

## Implémentation côté module conformité

Façade `ConformiteQueryFacade` dans `interface/public-api/` :

```ts
@Injectable()
export class ConformiteQueryFacade implements ConformiteQueryPort {
  constructor(
    private readonly getStatusUseCase: GetVerificationStatusUseCase,
    private readonly cache: ConformiteStatusCache,
    private readonly eventBus: ConformiteEventBus
  ) {}

  async getVerificationStatus(id: ConseillerId, options?: { strict?: boolean }) {
    if (options?.strict) {
      return this.getStatusUseCase.execute({ conseillerId: id, bypassCache: true });
    }
    return this.cache.getOrCompute(id, () =>
      this.getStatusUseCase.execute({ conseillerId: id, bypassCache: false })
    );
  }

  // ... etc.
}
```

La logique métier reste dans `GetVerificationStatusUseCase` (couche
application). La façade n'orchestre que cache + use case.

---

## Tests requis (Principe VI)

- `GetVerificationStatusUseCase` : pure, testable sans Nest.
  - Cas nominal : conseiller verified → `{ verified: true, lastVerifiedAt: <date> }`.
  - Cas conseiller jamais vérifié : `{ verified: false, found: true, lastVerifiedAt: null }`.
  - Cas conseiller inconnu : `{ verified: false, found: false, lastVerifiedAt: null }`.
  - Cas conseiller anonymisé : `{ verified: false, found: false, lastVerifiedAt: null }` (pseudo-suppression).

- `ConformiteQueryFacade` : tests d'intégration avec fake cache et fake use
  case. Vérifie le `strict` bypass.

- Contract test : un consommateur fictif (`@matching` ou `@seo`) consomme le
  port via une suite contract tests pour garantir que l'implémentation
  respecte le contrat publié.
