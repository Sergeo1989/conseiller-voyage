# Roadmap produit — Conseiller Voyage

**Document vivant.** Source de vérité pour le backlog stratégique. Chaque
entrée numérotée est destinée à devenir une spec détaillée via
`/speckit.specify` au moment opportun. Cette feuille de route peut évoluer
(ajouts, repriorisations, suppressions) ; chaque modification est
référencée par commit.

**Dernière mise à jour** : 2026-05-25

> **Note de numérotation** : les IDs de cette roadmap (001, 002, …) sont des
> identifiants logiques de feature. Les dossiers de spec sous `specs/`
> utilisent leur propre numérotation Spec Kit (`specs/<NNN>-<short-name>/`)
> qui peut diverger. Le mapping est tenu à jour dans la colonne *Spec* du
> tableau ci-dessous quand une spec a été créée.

---

## Principes produits encodés

Avant tout détail, deux invariants non-négociables qui cadrent **toutes** les
features de cette roadmap :

1. **L'intake est l'unique route de mise en relation.** Aucune page, aucun
   bouton, aucun chemin UX ne permet à un voyageur de contacter un
   conseiller en bypassant le formulaire d'intake (FR de qualification).
   *Formalisé dans [ADR-0002](adr/0002-pas-de-cta-contact-direct.md).*
2. **Le plafond de 3 conseillers par demande est appliqué côté algorithme**
   (constitution, Principe III), pas côté navigation. Cf. spec
   `001-conformite-module` pour le statut "vérifié" qui filtre l'éligibilité.

Toute feature qui transgresse l'un de ces deux invariants doit être
rejetée à la revue, quelle que soit la pression commerciale.

---

## Légende

| Symbole | Sens |
|---|---|
| ✅ | Spec mergée |
| 🟡 | Spec en cours d'écriture |
| 🔵 | Plan d'implémentation en cours |
| ⏳ | Backlog — `/speckit.specify` à venir |
| 🧊 | Différé post-MVP (Tier 5) |

Scope : **S** (1 spec, < 5 user stories) · **M** (~5 US, ~20 FR, équivalent au spec 001) · **L** (à scinder en 2-3 specs).

---

## Tier 0 — Fondations (bloquent tout)

| ID | Feature | Module | Scope | État | Spec | Pourquoi en premier |
|---|---|---|---|---|---|---|
| **001** | Module conformité (statut vérifié, source de vérité) | conformité | M | 🔵 implémentation en cours | `specs/001-conformite-module/` | Gardien Principe I. Bloque toute visibilité publique de conseiller et toute éligibilité matching. |
| 002 | Identité — auth conseiller + admin, RBAC (base AuthGuard) | identité | M | ⏳ | — | Bloque tout consommateur authentifié. AuthGuard NestJS partagé Auth.js v5 (ADR-0004). MFA scope extrait dans 002a. |
| **002a** | Identité — MFA conseiller TOTP + step-up + reset admin | identité | M | 🟡 spec en cours | `specs/005-mfa-conseiller/` | Extraction du scope MFA de l'ancien 002. Exigence Principe IX NON-NÉGOCIABLE. Auth.js v5 natif TOTP, pas de dépendance externe. |
| 003 | Identité — notifications + courriel transactionnel | identité | M | ⏳ | — | Bloque FR-005 conformité, rappels d'expiration, accusés de soumission. Provider canadien (ADR à venir). |
| 004 | Mentions légales, CGU, page « Comment ça marche », politique Loi 25 | transverse | M | 🟡 PR ouverte (#12) | `specs/004-mentions-legales/` | Obligation contractuelle dès première mise en ligne publique. Texte FR-CA. Page « Comment ça marche » = pédagogie modèle anti-marketplace (ADR-0002). |

---

## Tier 1 — Activation conseiller (B2B)

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 005 | Profil conseiller (public + privé) | identité × SEO | M | ⏳ | 001, 002 |
| 006 | Facturation — onboarding abonnement (Stripe Checkout) | facturation | M | ⏳ | 002 |
| 007 | Facturation — récurrence, factures, TPS/TVQ | facturation | M | ⏳ | 006 |

**Contraintes spécifiques à 005 (profil conseiller)** — encadrement [ADR-0002](adr/0002-pas-de-cta-contact-direct.md) :

- Vue publique = bio, certifications visibles (gage de sérieux), spécialités, années d'expérience, langues, photo. Conditionnée au statut `verified` (consomme `ConformiteQueryPort`).
- **Aucun CTA de contact direct.** Le seul CTA est « Décrivez votre projet — peut-être ce conseiller, peut-être un autre mieux aligné, jusqu'à 3 maximum » et mène à l'intake.
- Section explicative « pourquoi pas de contact direct » obligatoire.
- Vue privée (dashboard conseiller) = mes leads, mon profil éditable, ma conformité, ma facturation.

**Contraintes spécifiques à 006-007 (facturation)** — encadrement Principe I :

- Stripe **uniquement** pour l'abonnement B2B conseiller. **Aucune** intégration paiement liée à un voyage ou à un client final.
- Module `facturation` isolé du module `matching`. Le matching ne consulte jamais Stripe.
- En cas d'impayé : suspension d'accès via le module identité (la session conseiller est révoquée), pas via une suppression dans conformité (le statut de conformité reste vérifié, le conseiller est juste hors-ligne).

---

## Tier 2 — Boucle économique cœur

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 008 | Intake — brief structuré, validation déterministe, brouillon | préqualification | M | ⏳ | — (voyageur anonyme) |
| 009 | Intake — enrichissement LLM (reformulation, extraction d'intentions) | préqualification | M | ⏳ | 008, ADR fournisseur LLM |
| 010 | Intake — soumission + magic-link de suivi voyageur | préqualification × identité | S | ⏳ | 003, 008 |
| 011 | Matching — scoring conseiller × brief (pur, TDD obligatoire) | matching | M | ⏳ | 001, 008 |
| 012 | Matching — notifications + machine d'état de lead | matching | M | ⏳ | 003, 011 |
| 013 | Conversation conseiller ↔ voyageur (post-acceptation) | matching | M | ⏳ | 011, 012 |
| 014 | Tableau de bord conseiller (mes leads, conversations) | matching × identité | M | ⏳ | 005, 012, 013 |
| 015 | Espace voyageur post-intake (mes 3 conseillers, suivi) | matching | M | ⏳ | 010, 012, 013 |

**Contraintes spécifiques à 011-012 (matching)** — application Principe III et ADR-0002 :

- Scoring = fonction pure dans la couche domaine, **TDD obligatoire** (Principe VI).
- Plafond 3 conseillers strict, vérifié par test d'invariant. Aucun mode dégradé qui contourne ce plafond.
- Filtrage du statut `verified` via `ConformiteQueryPort.strict` (latence < 10 s pour transitions négatives, cf. spec 001 FR-022).
- Notifications : **un job BullMQ par destinataire**, idempotent, jamais un job pour les 3 destinataires (constitution, Principe X).
- Machine d'état du lead : `envoyé → vu → accepté → refusé → devis_envoyé → réservation_confirmée → perdu`, transitions horodatées et persistées append-only.
- **Signal optionnel** : un conseiller consulté publiquement par le voyageur dans les 24 h précédant le brief peut recevoir un léger boost de scoring (≤ +10 %), à inscrire dans le spec si retenu. Sans casser le top-3.

**Contraintes spécifiques à 013 (conversation)** — application Principe I :

- Échange textuel structuré + pièces jointes éventuelles.
- **Aucun** champ de paiement, aucun lien de réservation interne, aucun montant facturable transmis par la plateforme. Les devis sont des PDF que le conseiller envoie, transmis tels quels.
- Le voyageur règle directement avec le conseiller hors plateforme.
- Mention rappelée dans l'UI : « La plateforme ne participe pas à la transaction. Toute soumission et tout paiement se font directement entre vous et le conseiller. »

---

## Tier 3 — Acquisition (SEO francophone)

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 016 | Pages publiques individuelles de conseillers vérifiés | SEO | M | ⏳ | 001, 005 |
| 017 | Schemas JSON-LD + sitemaps dynamiques + hreflang | SEO | S | ⏳ | 016 |
| 018 | Pages d'atterrissage par thématique de voyage (FR-CA) | SEO | M | ⏳ | 016, 017 |
| 019 | GEO / AI search readiness (llms.txt, citabilité passages) | SEO | S | ⏳ | 016-018 |

**Contraintes spécifiques à 016 (pages publiques individuelles)** — application [ADR-0002](adr/0002-pas-de-cta-contact-direct.md) :

- **Anti-pattern marketplace strictement interdit.** Pas de bouton « contacter », pas de formulaire de contact, pas de chat direct, pas de numéro de téléphone affiché.
- CTA unique vers `/intake` avec copy explicite « Décrivez votre projet — peut-être ce conseiller, peut-être un autre mieux aligné. ».
- Section permanente « Pourquoi je ne peux pas contacter ce conseiller directement ? » qui explique le modèle (renvoie à `/comment-ca-marche`).
- Schémas JSON-LD `Person` / `ProfessionalService` mais **pas** de propriété `contactPoint` ni `telephone`. La seule action structurée pointe vers l'intake.

**Contraintes spécifiques à 018 (pages thématiques)** :

- Listing de conseillers vérifiés (avec filtres province / spécialité / langue), mais chaque carte renvoie à la page profil 016, jamais à un contact direct.
- Optionnel : un CTA « Décrire mon projet de voyage [thématique] » qui pré-remplit le brief avec la thématique.

**Contraintes performance (constitution, *Patrons d'exécution*) sur tout le Tier 3** :

- LCP < 2,5 s, INP < 200 ms, CLS < 0,1.
- Lighthouse CI bloquant en pipeline.
- Pages indexables crawlables via CDN canadien, contenu FR-CA en source canonique, EN différé via hreflang.

---

## Tier 4 — Opérations & polish

| ID | Feature | Module | Scope | État | Dépend de |
|---|---|---|---|---|---|
| 020 | Compliance dashboard admin agrégé | conformité × ops | S | ⏳ | 001 |
| 021 | Observabilité centrale + 4 métriques boucle économique | transverse | M | ⏳ | 008, 011, 012 |
| 022 | Retention sweep job (anonymisation post-rétention) | conformité × transverse | S | ⏳ | 001, 010 |
| 023 | Effacement Loi 25 cross-module (orchestration) | identité × transverse | M | ⏳ | 001, 002, 008, 011 |
| 024 | Infrastructure i18n (avant ajout EN) | transverse | S | ⏳ | — |
| 025 | Design system + composants accessibles WCAG 2.1 AA | transverse | M | ⏳ | 005, 014 |

**Spécifique à 021 (observabilité)** — application Principe VII :

- Les **4 métriques de premier ordre** de la constitution sont instrumentées : taux de complétion intake, % leads acceptés, conversion lead→devis→réservation, churn conseiller.
- Seuils d'alerte définis par feature.
- Tableau de bord central lié dans `README.md` racine.

**Spécifique à 023 (effacement Loi 25)** :

- Un cas d'usage `EraseUserDataUseCase` central orchestre la propagation : conformité (anonymise profil + documents), intake (anonymise briefs), matching (anonymise leads), facturation (conserve factures pour obligation comptable), SEO (déréférence).
- **Conservation du journal d'audit 7 ans** — l'obligation légale supplante le droit à l'effacement (arbitrage déjà acté dans spec 001).
- Demande utilisateur initiée depuis l'espace voyageur ou conseiller, route authentifiée.

---

## Tier 5 — Différé post-MVP 🧊

Idées notées pour transparence ; **hors scope V1**. À reconsidérer au cas par
cas via un `/speckit.specify` quand le moment vient.

- OCR automatique des certificats (spec 001, recherche R5).
- Scan antivirus des documents soumis (spec 001, recherche R5).
- Intégration API OPC / TICO en temps réel (spec 001, recherche R1).
- Attribution multi-admin (queue claims) — quand l'équipe admin grandit.
- Application mobile native ou PWA installable.
- Multi-rôle admin (admin-conformité vs admin-tech).
- Notation / avis voyageurs sur conseillers (post-réservation).
- Suivi post-voyage / feedback boucle économique.
- Programme de parrainage conseiller.
- API publique pour partenaires (agences mère, comparateurs).
- Internationalisation au-delà du Canada (autres pays francophones).

---

## Graphe de dépendances

```
                              ┌──────────────────────────┐
                              │ 002-003 Identité (auth + │
                              │  notifs + courriel)      │
                              └────────┬─────────────────┘
                                       │ (bloque presque tout)
              ┌────────────────────────┼─────────────────────┐
              ▼                        ▼                     ▼
      ┌─────────────┐         ┌────────────────┐    ┌────────────────┐
      │ 001 Confor- │         │ 006-007        │    │ 008-009 Intake │
      │   mité  🔵   │         │  Facturation   │    │  brief + LLM   │
      └──────┬──────┘         └────────────────┘    └────────┬───────┘
             │                                               │
             │     ┌────────────────────┐                    │
             ├────►│ 005 Profil consei- │                    │
             │     │  ller pub+privé    │                    │
             │     └──────┬─────────────┘                    │
             │            │                                  │
             │            └──┬─────────────────┬─────────────┤
             │               ▼                 ▼             ▼
             │     ┌──────────────────┐   ┌─────────────────────┐
             │     │ 016-019 SEO      │   │ 011-013 Matching    │
             │     │ (anti-marketplace│   │  scoring + leads    │
             │     │  cf. ADR-0002)   │   │  + conversation     │
             │     └──────────────────┘   └──────┬──────────────┘
             │                                   │
             │                                   ▼
             │                            ┌──────────────────────┐
             │                            │ 014-015 Dashboards   │
             │                            │  conseiller + voya-  │
             │                            │  geur                │
             │                            └──────────────────────┘
             │
             ▼
       ┌─────────────────────┐
       │ 020 Compliance      │
       │  dashboard admin    │
       └─────────────────────┘

       Transverses (en parallèle dès que possible) :
         021 Observabilité   |   022 Retention sweep   |
         023 Effacement Loi 25   |   024 i18n   |   025 Design system AA
```

---

## Séquence d'implémentation suggérée

| Sprint | Features visées | Justification |
|---|---|---|
| **0** | 001 (en cours), 004 (PR #12 ouverte) | 001 finalisation DoD. 004 = mentions légales + CGU + Loi 25 + Comment ça marche, livrable web public minimal. |
| **1** | 002, 002a | Auth de base + MFA conseiller en parallèle. 002a (spec 005) = Principe IX NON-NÉGOCIABLE, bloquant pour tout accès conseiller `verified`. |
| **2** | 003, 005 | Notifications + profil conseiller. 005 dépend de 001 + 002 + 002a (MFA actif avant accès aux leads). |
| **3** | 006, 008 | Facturation onboarding + intake brief. Parallélisable. |
| **4** | 009, 010, 011, 024 | Enrichissement LLM, magic-link, scoring matching, infra i18n. |
| **5** | 012, 013, 007 | Notifs + état de lead, conversation, facturation récurrence. |
| **6** | 014, 015, 020 | Dashboards conseiller, voyageur, admin. |
| **7** | 016, 017, 021 | Premières pages publiques SEO + observabilité centrale. |
| **8** | 018, 019, 022, 023 | Pages thématiques, GEO/AI, retention sweep, effacement Loi 25. |
| **9** | 025 | Design system formalisé (peut démarrer plus tôt si capacité). |
| **post** | Tier 5 selon traction | Au cas par cas. |

Cadence indicative ; le réel dépendra de la taille d'équipe et des
priorités commerciales. Chaque spec a son propre cycle Specify → Clarify →
Plan → Tasks → Implement.

---

## Mises à jour de cette roadmap

Toute modification de cette feuille de route (ajout, retrait, repriorisation,
changement de scope significatif) **DOIT** être committée avec un message
explicite et, si elle touche un invariant produit (Principes I, II, VI, IX
de la constitution ; ADR-0002), faire l'objet d'un ADR.
