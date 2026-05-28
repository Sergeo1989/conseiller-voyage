# Contract — `EstProfilPublicPort` (port public consommé par 011 + 016)

**Module** : `identite` (exposé publiquement)
**Couche** : application (port public + use case)
**Consommateurs futurs** : module matching (feature 011), module SEO (016)

---

## Raison d'être

Cette feature 005 **n'implémente pas** le matching ni les listings SEO,
mais elle pose la **source de vérité unique** que ces features
consommeront pour déterminer si un conseiller est éligible à apparaître
publiquement.

Avant cette feature, 001 exposait `ConformiteQueryPort.estVerifie(id)`
(condition nécessaire). 005 ajoute la condition suffisante : il faut AUSSI
un profil en statut `prêt`. Le port combiné évite que 011 et 016 doivent
chacun re-encoder cette logique.

---

## Signature TypeScript

```typescript
// packages/identite-public/src/est-profil-public.port.ts

export interface EstProfilPublicPort {
  /**
   * Retourne true si et seulement si le conseiller est éligible à
   * apparaître publiquement (page profil, matching, listings SEO).
   *
   * Définition formelle :
   *   estPublic(id) = conformite.estVerifie(id)
   *                && profil.statut(id) === 'pret'
   *
   * Inclut implicitement :
   *   - profil n'est pas 'incomplet', 'masque_admin', ni 'anonymise'
   *   - conseiller existe (id valide)
   *
   * Cas null/undefined : retourne false (fail-safe).
   */
  estPublic(conseillerId: string): Promise<boolean>;

  /**
   * Variante batch — pour 011 qui veut filtrer un pool de candidats.
   * Retourne la sous-liste des IDs réellement publics.
   */
  filtrerPublics(conseillerIds: string[]): Promise<string[]>;
}
```

---

## Implémentation

Adaptateur Prisma :

```typescript
class PrismaEstProfilPublic implements EstProfilPublicPort {
  constructor(
    private prisma: PrismaService,
    private conformite: ConformiteQueryPort,
  ) {}

  async estPublic(conseillerId: string): Promise<boolean> {
    if (!conseillerId) return false;
    const profil = await this.prisma.conseillerProfile.findUnique({
      where: { authUserId: conseillerId },
      select: { statut: true },
    });
    if (!profil || profil.statut !== 'pret') return false;
    return this.conformite.estVerifie(conseillerId);
  }

  async filtrerPublics(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const profils = await this.prisma.conseillerProfile.findMany({
      where: { authUserId: { in: ids }, statut: 'pret' },
      select: { authUserId: true },
    });
    const profilsReady = profils.map(p => p.authUserId);
    const conformes = await this.conformite.filtrerVerifies(profilsReady);
    return conformes;
  }
}
```

---

## Garanties / Invariants

1. **Source de vérité unique** : `EstProfilPublicPort` est la fonction
   AND de deux booléens (conformité + statut profil). Aucun consommateur
   ne doit recalculer cette logique.
2. **Performance** : `estPublic` p95 < 20 ms (2 lookups indexés).
   `filtrerPublics` p95 < 100 ms pour 100 IDs (2 queries batchées).
3. **Pas de cache** au niveau du port (les consommateurs cacheront leurs
   propres résultats avec TTL court si pertinent). L'invalidation
   cross-module est complexe et propre à chaque consommateur.
4. **Pas de fuite d'information** : le port retourne uniquement `bool`,
   jamais la raison d'exclusion (ne distingue pas `incomplet` de
   `masque_admin` de `conformité expirée`). Cohérent avec
   l'anti-énumération (Principe IV — Insecure Design).

---

## Tests

| Test | Scénario |
|---|---|
| Conseiller `verified` + profil `prêt` → `true` | Nominal |
| Conseiller `verified` + profil `incomplet` → `false` | FR-022 |
| Conseiller `pending` + profil `prêt` → `false` (conformité gate) | FR-022 |
| Conseiller `verified` + profil `masque_admin` → `false` | FR-023 |
| Conseiller `verified` + profil `anonymise` → `false` | FR-016 |
| Conseiller inexistant → `false` | Fail-safe |
| `filtrerPublics([])` → `[]` | Edge case |
| `filtrerPublics([a, b, c])` mixed → seuls les éligibles | Batch |
