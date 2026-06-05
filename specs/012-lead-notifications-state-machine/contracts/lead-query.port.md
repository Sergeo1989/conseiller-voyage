# Contrat — Port public `MatchingLeadQueryPort` (012)

Interface publique exposée par le module matching (via `@cv/shared/matching`), consommée par **014** (tableau de bord conseiller) et **015** (espace voyageur — vue restreinte). Token DI : `MATCHING_LEAD_QUERY_PORT = Symbol.for('MatchingLeadQueryPort')`.

## Opérations (lecture seule)

```
interface MatchingLeadQueryPort {
  // Leads d'un conseiller (dashboard 014). Re-filtrage verified appliqué côté lecture.
  listLeadsForConseiller(conseillerId, { state?, page, pageSize }): Promise<LeadAdminListView>

  // Détail d'un lead (sans déclencher de transition — lecture pure pour clients).
  getLeadById(leadId): Promise<LeadDetailView | null>

  // Vue voyageur agrégée d'un brief (015) : statuts des conseillers du top 3 sans PII conseiller superflue.
  getBriefLeadsSummary(briefId): Promise<BriefLeadsSummaryView | null>
}
```

## Vues retournées

- `LeadDetailView` : `{ id, matchingResultId, position, conseillerId, currentState, scoreFinal, boosted, createdAt, history[] }` — sans PII voyageur.
- `BriefLeadsSummaryView` : `{ briefId, leads: [{ position, currentState, conseillerVerifie: bool }] }` — pour informer le voyageur de l'avancement (consommé par 015), **null si brief anonymisé**.
- Le statut `conseillerVerifie` est résolu dynamiquement (`ConformiteQueryPort`) au moment de la lecture.

## Garanties

- **Lecture pure** : aucune transition n'est déclenchée par ce port (contrairement à `GET /leads/:id` qui auto-`vu`).
- **Filtrage dynamique** : un conseiller non vérifié au moment de la lecture est marqué `conseillerVerifie=false` (et masqué côté 015 selon la politique anti-marketplace).
- **Loi 25** : retourne `null` / champs neutralisés pour un brief anonymisé.

## Consommateurs

- **014** : `listLeadsForConseiller` + `getLeadById` (les actions de transition passent par les endpoints HTTP, pas par ce port lecture).
- **015** : `getBriefLeadsSummary` (lecture voyageur de l'avancement).
