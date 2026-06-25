# Runbook — Monitoring adoption profil conseiller (SC-005)

**Owner** : équipe produit
**Fréquence** : hebdomadaire (lundi matin)
**Source de vérité** : `docs/dashboards/profile-adoption.json`
**Workflow** : `.github/workflows/scan-profile-adoption.yml`

---

## Objectif

Mesurer le **ratio d'adoption** des profils conseiller dans la cohorte
des 30 derniers jours, défini comme :

```
adoptionRatio = profils avec statut "pret" / total profils créés sur la fenêtre
```

**Cible SC-005** : `adoptionRatio ≥ 0.80` (80 % des conseillers
finalisent leur profil dans le mois suivant leur inscription).

Cette métrique est une **préfiguration** de la feature 021 (observabilité
boucle économique) — elle vit dans un JSON versionné en git plutôt
qu'un dashboard Grafana, pour rester lisible sans infrastructure.

## Format du dashboard

`docs/dashboards/profile-adoption.json` (mis à jour à chaque exécution
du workflow ; le commit est tracé en git blame) :

```json
{
  "measuredAt": "2026-05-28T09:00:00.000Z",
  "windowDays": 30,
  "totalCohort": 142,
  "byStatut": {
    "incomplet": 18,
    "pret": 121,
    "masque_admin": 2,
    "anonymise": 1
  },
  "adoptionRatio": 0.852,
  "scTarget": 0.80,
  "ok": true
}
```

## Activation du workflow

Le scan ne tourne qu'en présence des **deux** prérequis suivants côté
GitHub Actions (Settings → Actions) :

1. **Variable** `PRODUCTION_DEPLOYED=true` — confirme que la prod
   héberge une vraie base avec des conseillers.
2. **Secret** `DATABASE_URL_READONLY` — chaîne de connexion Postgres en
   lecture seule (rôle dédié, **JAMAIS** la connection prod r/w).

Sans ces deux éléments, le workflow exit 0 sans erreur (skip lisible
dans les logs).

### Création du rôle lecture seule

```sql
-- Sur la DB production
CREATE ROLE scan_adoption_ro WITH LOGIN PASSWORD '<rotated-monthly>';
GRANT CONNECT ON DATABASE conseiller_voyage TO scan_adoption_ro;
GRANT USAGE ON SCHEMA public TO scan_adoption_ro;
GRANT SELECT ON profile_conseiller_profiles TO scan_adoption_ro;
-- Ce rôle ne peut lire QUE la table profile_conseiller_profiles.
-- Aucun accès aux tables PII (auth_users, etc.) qui ne sont pas
-- nécessaires pour cette métrique.
```

## Investigation en cas de `ok: false`

Le workflow met une `::warning::` dans la run logs quand
`adoptionRatio < scTarget` (= 0.80). Procédure d'investigation :

1. **Identifier la fenêtre** — `windowDays` (par défaut 30) + `measuredAt`.
2. **Lire le détail `byStatut`** :
   - Beaucoup d'`incomplet` → frein UX dans le formulaire d'édition.
     Pistes : champs requis trop nombreux, photo upload bloquant,
     toggle `afficherNomComplet` mal compris (FR-006b Loi 25).
   - Beaucoup de `masque_admin` → afflux de profils non conformes
     (modération sortie de spec). Voir `docs/runbooks/profil-moderation.md`.
   - Beaucoup d'`anonymise` → afflux de demandes Loi 25 inhabituel.
     Voir `docs/runbooks/profil-anonymisation-loi25.md`.
3. **Croiser avec adoption par cohorte mensuelle** : lancer
   manuellement le workflow avec `--window-days 90` pour voir si c'est
   structurel ou une régression récente.
4. **Si régression** : vérifier les commits récents qui touchent
   `EditerProfilUseCase`, le wizard édition, les relances onboarding
   (BullmqOnboardingRelanceScheduler).

## Évolution future (feature 021)

Quand la feature 021 (observabilité boucle économique) sera livrée,
cette métrique migrera vers Grafana Cloud Canada (ADR-0003) avec les
trois autres métriques de Principe VII :

- Taux de complétion intake
- % leads acceptés
- Conversion lead → devis → réservation
- Churn conseiller

Le workflow actuel pourra être supprimé une fois Grafana en place
(le JSON git restera comme historique long-terme).

## Liens

- [Spec 007 — SC-005](../../specs/007-profil-conseiller/spec.md)
- [Workflow](../../.github/workflows/scan-profile-adoption.yml)
- [CLI](../../apps/api/src/cli/scan-profile-adoption.ts)
- [Constitution v2.3.0 — Principe VII (Observabilité boucle économique)](../../.specify/memory/constitution.md)
