# Research — Matching scoring conseiller × brief

**Phase** : 0 (résolution des unknowns avant Phase 1 Design)
**Date** : 2026-05-31
**Branch** : `008-matching-scoring`

Ce document consolide les décisions techniques et les alternatives évaluées pour les 7 unknowns identifiés en Phase 0 du plan. Chaque section suit le pattern : **Décision → Rationale → Alternatives considérées**. Les décisions structurantes feront l'objet d'ADRs (0020 à 0023) en Phase d'implémentation.

---

## R1 — Pondération initiale des 4 axes de scoring

**Décision** :

| Axe | Poids | Justification |
|---|---|---|
| Destination match | **0,35** | Signal le plus fort : un conseiller « spécialiste Cuba » est de loin le meilleur match pour un brief Cuba. Plus discriminant que les autres axes. |
| Proximité géographique (FSA) | **0,25** | Préférence locale forte au Québec (relation in-person valorisée). Inclut un palier à 0 km (FSA exact), 25 km (même région), 100 km (même province), > 100 km (autre province). |
| Spécialité (lune_de_miel, aventure…) | **0,25** | Signal complémentaire à la destination — un spécialiste Cuba qui ne fait pas de lune de miel doit céder le pas à un spécialiste lune de miel généraliste pour un brief honeymoon. |
| Familiarité voyageur ↔ expérience conseiller | **0,15** | Signal modulant : novice ↔ mentor → +full, novice ↔ pair → +half, expert ↔ pair → +full, expert ↔ mentor → +half. Plus faible car difficile à objectiver côté conseiller en MVP. |

**Total normalisé** : ∑ = 1,00. Le score brut final est ∈ [0, 1]. Le score boosté ∈ [0, 1,10] (boost ≤ +10 %, FR-011).

**Rationale** :
- Les poids reflètent la hiérarchie naturelle d'un dossier voyage selon la pratique observée dans les agences canadiennes : destination → spécialité → proximité → familiarité.
- Total = 1,0 (normalisé) facilite la lecture du `scoreComponents` côté admin (« 80 % match destination, 60 % géo, … »).
- La pondération est **injectée comme `WeightsConfig`** dans la fonction pure (Principe VIII Open/Closed) — re-pondérer en prod = bump `algorithmVersion` dans `MatchingResult` (traçabilité) + bump version package shared.

**Alternatives considérées** :

- **Apprentissage automatique (ML)** : rejeté MVP. Aucune donnée d'entraînement (taux d'acceptation conseiller arrive avec 012) ; introduit un risque d'opacité non aligné avec Principe VI (déterminisme). Une évolution future via LLM (feature 009 enrichissement intake) pourra alimenter le BriefSnapshot sans toucher cette pondération.
- **Pondération uniforme (0,25 × 4)** : rejeté. Ne reflète pas la hiérarchie pratique ; en particulier, sous-évalue la destination.
- **Poids = 1 sur destination, 0 sur le reste** : rejeté. Réduit le matching à un filtre — perd la nuance géo/spécialité/familiarité utile au plafond 3.

**ADR à créer** : **ADR-0020 — Pondération initiale des 4 axes de matching**.

---

## R2 — Algorithme de distance géographique

**Décision** : **Haversine sur centroïdes FSA canadiens**. La distance entre deux conseillers / voyageurs est calculée comme la distance grand-cercle (formule Haversine) entre les centroïdes lat/lng des FSA respectifs.

```typescript
// Pseudocode — fonction pure dans le domaine
function computeFsaDistance(a: FsaCode, b: FsaCode, centroids: FsaCentroidTable): number {
  const cA = centroids.lookup(a); // { lat, lng }
  const cB = centroids.lookup(b);
  return haversineKm(cA, cB);     // ~50 µs
}
```

Le score géo est ensuite dérivé par paliers :

| Distance | Score géo |
|---|---|
| 0 km (même FSA) | 1,00 |
| 0-25 km | 0,80 |
| 25-100 km | 0,50 |
| 100-500 km | 0,20 |
| > 500 km | 0,05 |

**Rationale** :
- Haversine donne une précision ~1 m sur la surface terrestre — bien au-delà de ce que nécessite un matching local Québec / Canada (granularité utile : 1-10 km).
- Centroïdes FSA = ~3-5 km de rayon par FSA — précision suffisante pour les paliers ci-dessus.
- Calcul O(1) par paire (~50 µs en TypeScript V8). Pour 80 candidats × 1 brief = 4 ms total — négligeable vs SLO 800 ms.
- Aucune dépendance externe (pas d'appel d'API) — conforme Loi 25 (pas de fuite de PII) et constitution *Plafond coût LLM* (n/a ici mais cohérent avec le principe « pas de tiers sans besoin »).
- Implémentation pure 100 % testable, déterministe.

**Alternatives considérées** :

- **Geocoding via API externe (Google Maps, Mapbox, OSM Nominatim)** : rejeté. (a) Coût récurrent. (b) Fuite de PII voyageur (code postal) vers un tiers non garanti `ca-central-1` — incompatible Loi 25. (c) Latence réseau + circuit breaker à gérer — surcomplexité pour une donnée géo statique.
- **Distance Manhattan lat/lng** : rejeté. Approximation grossière, peut sur/sous-estimer de ±30 % en haute latitude (cas québécois).
- **Distance euclidienne (sqrt((Δlat)² + (Δlng)²))** : rejeté. Même problème, ignore la courbure terrestre.
- **Vincenty (ellipsoïdal)** : rejeté. Plus précis que Haversine (~1 mm), mais ~10× plus coûteux et complexité injustifiée pour un matching à granularité km.

**ADR à créer** : **ADR-0021 — Algorithme de distance FSA Haversine sur centroïdes**.

---

## R3 — Source du fichier FSA centroïdes

**Décision** : **Statistique Canada — Forward Sortation Area Geographic Centroids**, distribué sous **Open Government Licence – Canada** (compatible MIT/Apache au sens des licences acceptées par la constitution *Chaîne d'approvisionnement*).

Fichier embarqué :

- Chemin : `packages/shared/src/matching/fsa-centroids.json`
- Taille : ~150 KB minifié (1 622 FSA × {lat:number, lng:number, province:string})
- Format : objet TypeScript constant exportable, validation Zod au chargement (defense-in-depth contre corruption du fichier).
- Mise à jour : annuelle (Statistique Canada révise les frontières FSA via Postes Canada). Procédure documentée dans `docs/runbooks/matching-fsa-update.md` à créer (Phase 8 polish).

**Rationale** :
- Source officielle, faisant autorité, gratuite.
- Open Government Licence – Canada : autorise « use, share, alter for any purpose, including commercial » avec attribution simple — compatible avec une plateforme commerciale.
- Pas d'appel réseau, pas de cache à invalider — la fonction pure devient triviale à tester (un fixture FSA suffit).
- 1 622 FSA × ~50 bytes JSON minifié = ~80 KB ; négligeable côté bundle backend (jamais expédié au navigateur — utilisé seulement par le module matching dans `apps/api`).

**Alternatives considérées** :

- **OpenStreetMap (Overpass API ou export Geofabrik)** : rejeté. Granularité différente (codes postaux complets, pas FSA). Surcomplexité d'extraction et de nettoyage. Licence ODbL plus contraignante (share-alike) — pose des questions juridiques sur la réutilisation interne.
- **Postes Canada Address Data** : rejeté. Licence commerciale payante (~10k CAD/an). Surinvestissement pour un MVP.
- **Géocodage commercial (Google, Mapbox)** : rejeté (cf. R2 — Loi 25 + coût).
- **Centroïdes provincaux uniquement** : rejeté. Granularité 1 niveau trop grossière (toute Quebec = un seul centroïde) — supprimerait toute valeur du signal géo.

**ADR à créer** : **ADR-0022 — Source FSA centroïdes Statistique Canada + licence OGL-Canada**.

**Tâche Phase 2** : T0XX — télécharger + traiter le fichier source StatCan, générer le JSON minifié, valider la couverture (1 600+ FSA), commit.

---

## R4 — Stratégie d'anonymisation cascade Loi 25

**Décision** : **Trigger Postgres `AFTER UPDATE` sur `voyageur_briefs`**. Quand `voyageur_briefs.status` passe à `anonymized` (cas Loi 25 FR-022 / FR-022a), un trigger Postgres exécute en cascade :

1. Met à jour `matching_results.briefId = NULL` (le pointeur PII voyageur disparaît).
2. Met à jour `matching_results.suggestedConseillerId = NULL` (PII cookie).
3. Redacte `matching_result_entries.scoreComponents` (JSONB) en remplaçant les valeurs détaillées par `{"redacted": "loi25"}`.

Le `MatchingResult` lui-même reste en base (audit Loi 25 + trace des conseillers historiquement notifiés pour 012). Seules les **liaisons PII** sont anonymisées.

**Rationale** :
- Pattern hérité de **feature 008** (`intake_anonymisation_trigger` migration) — déjà éprouvé en CI + staging.
- Atomicité Postgres garantit qu'on ne peut pas avoir un MatchingResult orphelin pointant vers un brief anonymisé partiel — contrainte tenue au niveau DB, indépendamment du code applicatif.
- Latence < 50 ms (mesure 008) — conforme exigence Loi 25 effacement < 60 s.
- Pas de dépendance à la disponibilité d'un worker BullMQ (pas de risque de rétention PII si worker HS).

**Alternatives considérées** :

- **Job applicatif BullMQ déclenché par event outbox `voyageur.brief.deleted`** : rejeté. (a) Latence supplémentaire (file d'attente). (b) Risque de PII en rétention si worker indisponible — incompatible avec exigence < 60 s. (c) Plus testable côté unit, mais le bénéfice ne justifie pas le risque réglementaire.
- **CASCADE FK** : rejeté. Supprimerait la ligne `MatchingResult` entière — perte de l'audit historique (« ce voyageur a été matché avec ces 3 conseillers à cette date »).
- **Mise à NULL via use case applicatif synchrone** : rejeté. Dépend de l'orchestration du flux d'anonymisation côté 008 — couplage cross-module.

**ADR à créer** : **ADR-0023 — Anonymisation cascade matching via trigger Postgres**.

---

## R5 — Source canonique de l'adresse conseiller (validation Q2 clarify)

**Décision** : **Hiérarchie `ConseillerProfile.address` (feature 007, source primaire) → `ConformiteCompliance.siegeSocialAddress` (feature 001, fallback)**. Confirmation de la Q2 du `/speckit-clarify`.

**Vérification** :
- ✅ **Feature 007** expose une `address` sur `ConseillerProfile` (confirmé par lecture du schema Prisma `packages/db/prisma/schema/profil.prisma`) — comprend rue, ville, province, **code postal**. Le code postal sert au matching (les autres champs ne sont pas requis ici).
- ⚠ **Feature 001** : à vérifier si l'adresse complète (avec code postal) est sur `ConformiteCompliance`. Si non, **option de migration mineure** (`ALTER TABLE conformite_compliances ADD COLUMN siege_postal_code VARCHAR(7) NULL`) à faire au début de l'implémentation. Pas un blocker — la majorité des conseillers en jour 1 auront saisi leur adresse profil (le profil est obligatoire dans 007).

**Implémentation côté adapter** :

```typescript
// PrismaConseillerSnapshotReader
async readAllVerifiedSnapshots(): Promise<ConseillerSnapshot[]> {
  // 1. Filtre verified via ConformiteQueryPort (déjà publié 001)
  // 2. Pour chacun : prend profile.address.postalCode si non null
  // 3. Sinon : prend compliance.siegeSocialPostalCode (à confirmer)
  // 4. Si les deux nulls : exclu (FR-009c — audit "matching.conseiller_address_missing")
}
```

**Alternatives considérées (rappel Q2 clarify)** :
- A — Profil 007 uniquement
- B — Conformité 001 uniquement
- C — Nouveau champ dédié `matchingAddress` (extension schema 007)
- D — **Hiérarchie 007 → 001 (choisi)**

---

## R6 — Stratégie de cache ConseillerSnapshot

**Décision** : **Pas de cache Redis en MVP**. La lecture des conseillers vérifiés se fait via Prisma direct à chaque calcul, avec une requête optimisée (`SELECT ... FROM conseiller_profiles WHERE statut='pret' AND id IN (verified_set)`).

**Rationale** :
- 100-500 conseillers vérifiés au MVP × 80 lignes typiques après filtre langue = lecture rapide (~20 ms en local Postgres warm cache).
- Le candidate set change à chaque event (nouveau brief avec nouvelle langue / destination filter) — le bénéfice d'un cache global est faible.
- Surcomplexité d'invalidation : un cache de `ConseillerSnapshot[]` doit être invalidé quand n'importe quel conseiller modifie son profil (007) ou change de statut (001). Le coût d'invalidation correcte > le coût de re-lecture.
- Mesurable post-MVP : si SLO p95 800 ms est tendu, on ajoute un cache. Sinon, simplicité.

**Alternatives considérées** :

- **Cache Redis global `verified_conseillers_set` avec TTL 60 s + invalidation explicite** : rejeté MVP. Bénéfice ~50 ms gagnés, coût invalidation cross-module non trivial.
- **Cache RSC Next.js / TanStack Query** : non applicable — le matching tourne backend pur, pas côté front.
- **Materialized View Postgres `verified_conseiller_snapshots`** : reportable à post-MVP si croissance > 5 000 conseillers vérifiés.

**Re-évaluation post-MVP** : si après 6 mois la lecture conseiller dépasse 100 ms p95 ou le throughput dépasse 10 briefs/s, ajouter un cache via le pattern `BullMQ event-driven invalidation` (consume `conformite.status_changed` + `profil.address_updated`).

---

## R7 — Outbox publisher : réutiliser ou dédié

**Décision** : **Outbox dédié `matching_outbox_entries`**. Ne pas réutiliser l'`intake_outbox_entries` de feature 008.

**Rationale** :
- **Séparation des modules** (Principe V). L'outbox 008 est conceptuellement la sortie du module `intake` — ajouter des events `matching` la mélange.
- **Throughput** : intake ~1k events/jour, matching ~4 events/brief × 1k briefs = ~4k events/jour. Outbox séparé évite la contention sur une seule file de publication.
- **Granularité des permissions** : le worker `OutboxPublisherJob` (003 notifications + extension 008) lit déjà N tables outbox modules — ajouter une table de plus suit le pattern.
- **Pattern hérité** : 001 conformité, 008 intake ont chacun leur outbox. Cohérence.

**Implémentation** :

- Table `matching_outbox_entries` (event_type, payload JSONB, idempotency_key, correlation_id, published_at NULL, etc.).
- Worker `OutboxPublisherJob` (extension à programmer en feature 003 polish — tâche Phase 8) ajoute `matching_outbox_entries` à son scan.
- Publication SES / autre transport delegated to 003 (pattern existing).

**Alternatives considérées** :

- **Réutiliser `intake_outbox_entries`** : rejeté (couplage modules).
- **Publier directement BullMQ sans table outbox** : rejeté. Pas d'atomicité DB + queue (Outbox Pattern requis pour Principe X idempotence stricte).
- **Outbox global cross-module unique** : rejeté. Anti-pattern monolithe modulaire — chaque module reste source de vérité pour ses événements.

---

## Synthèse — Toutes les NEEDS CLARIFICATION résolues

| # | Question | Décision |
|---|---|---|
| R1 | Pondération initiale des 4 axes | 0,35 / 0,25 / 0,25 / 0,15 (destination / géo / spécialité / familiarité) — ADR-0020 |
| R2 | Algorithme de distance | Haversine sur centroïdes FSA + 5 paliers de score géo — ADR-0021 |
| R3 | Source du fichier FSA | Statistique Canada Forward Sortation Area Centroids, licence OGL-Canada — ADR-0022 |
| R4 | Anonymisation cascade | Trigger Postgres `AFTER UPDATE` sur `voyageur_briefs.status='anonymized'` — ADR-0023 |
| R5 | Source adresse conseiller | Hiérarchie `profil.address` (007) → `conformite.siegeSocialAddress` (001) — confirmé Q2 clarify |
| R6 | Cache stratégie ConseillerSnapshot | Pas de cache MVP. Lecture Prisma directe. Re-évaluable post-MVP. |
| R7 | Outbox publisher | Table dédiée `matching_outbox_entries` consommée par worker 003 extension |

Toutes les `NEEDS CLARIFICATION` du plan sont **résolues**. Le plan peut passer à Phase 1 (Design & Contracts).
