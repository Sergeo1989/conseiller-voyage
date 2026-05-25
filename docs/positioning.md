# Positionnement — Conseiller Voyage

**Statut** : v1.0, 2026-05-25 (post-recon concurrentiel)
**Audience** : co-fondateurs, conseillers pilotes, investisseurs, agents IA
qui décident du scope produit.

Ce document est **vivant** — toute évolution du positionnement entraîne une
revue du `spec.md` des features impactées. Source de vérité pour calibrer
les questions du brief intake, les critères du scoring matching, et les
arguments commerciaux conseiller/investisseur.

---

## 1. Promesse en une phrase

> *Sans frais pour le voyageur, sans toucher au paiement, on connecte un brief
> de voyage qualifié à **3 conseillers vérifiés CCV/TICO maximum** qui
> correspondent au profil — le voyageur garde le choix éclairé, le conseiller
> garde sa commission, on garde la mise en relation hors transaction.*

Cette phrase encode 5 décisions stratégiques **non-négociables** :

1. **Sans frais pour le voyageur** → l'acquisition est libre, pas de friction
   commerciale au top de l'entonnoir.
2. **Sans toucher au paiement** → hors OPC/TICO par design (Principe I).
3. **3 conseillers max** → qualité > volume (Principe III), pas de spam.
4. **Vérifiés CCV/TICO** → trust signal compliance > tout marketing.
5. **Le voyageur garde le choix** → on ne push pas un conseiller, on en propose
   plusieurs avec leurs spécialités visibles, le voyageur arbitre.

---

## 2. Marché de référence (recon 2026-05-25)

### Voyages en Direct (voyagesendirect.com)

**Modèle** : réseau B2B fermé. ~115 agences membres au Québec, ~2 850 conseillers,
35 ans d'histoire. Vend aux agences : négociation collective fournisseurs,
marketing centralisé, formations, technologie propriétaire.

**Rôle dans la transaction** : pas d'acteur transactionnel direct. Chaque agence
membre opère indépendamment (sa marque, son permis OPC, ses clients). Voyages
en Direct est une couche d'agrégation B2B.

**Statut public** : site corporate, pages publiques minces (`/a-propos`, `/contact`
en 404 selon recon), pas de profils conseillers cherchables, pas de matching.

### Mon Voyage Mon Agence (monvoyagemonagence.ca)

**Modèle** : portail B2C de Voyages en Direct. Hub de contenu inspirationnel
(articles promo, vidéos Canal Rêve) avec CTA omniprésent *"Je veux une
soumission"*. Stack WordPress + Yatra/wp-travel.

**Mécanisme** : pas de matching algorithmique. Chaque conseiller du réseau
partage un lien personnalisé sur ses réseaux ; le visiteur arrivant via ce lien
est attaché à *ce* conseiller (vignette de session). Sans lien personnalisé,
routage opaque vers un conseiller VED.

**Profil conseiller exposé** : aucun. Pas de page navigable, pas de photo, pas
de spécialités, pas de filtres langue/destination/certification.

**Brief collecté** : type de forfait (Sud / Europe / Surprenez-moi), aéroport,
destination optionnelle, période, adultes/enfants, préférences libres.
**Pas de** budget, **pas de** langue, **pas de** spécialité.

**Frais** : gratuit voyageur, pas de prix conseiller affiché (modèle = adhésion
au réseau VED).

**Cible géo** : Québec exclusivement en pratique. Version `/en/` cosmétique.

---

## 3. Différenciation Conseiller Voyage (matrice)

| Axe | Voyages en Direct / MVMA | **Conseiller Voyage** |
|---|---|---|
| Modèle économique | B2B fermé (cotisations + commissions négociées) | B2C2B ouvert (lead qualifié facturé au conseiller, hors transaction) |
| Acteur central | L'**agence** | Le **conseiller individuel** |
| Touche-t-on à la transaction ? | Indirectement via agences membres | **Jamais** (Principe I) |
| Brief structuré | Type forfait + dates | Destination + dates + budget + **langue** + **spécialité** + **flexibilité dates** |
| Matching algorithmique | ∅ | Scoring testé pur Principe VI |
| Profil conseiller public | ∅ | Photo + bio + spécialités + langues + certif + agence + reviews + dispo |
| Plafond conseillers notifiés | 1 (ou opaque) | **3 max** (Principe III) |
| Concurrence transparente | ∅ | Le voyageur voit les 3 et choisit |
| Ouverture inter-réseaux | ∅ (captif VED) | Tout conseiller CCV/TICO admissible, peu importe l'agence |
| Tracking ROI conseiller | ∅ | Lead → devis → réservation → gagné (FR-013) |
| Géo dès J1 | QC | **QC + ON** (CCV + TICO) |
| i18n natif | Cosmétique | **FR-CA** premier, EN J1, ES roadmap |
| Stack | WordPress + Yatra | Next.js 15 SSR/SSG, Lighthouse ≥ 90, axe-core, Loi 25 native |

---

## 4. Le moat — ce qu'il faudrait pour nous copier

Un acteur installé (VED, TPI, Transat, Travel Brands) devrait :

1. **Refondre son stack public** (WordPress legacy → Next.js ou équivalent
   moderne avec SSR + i18n + a11y).
2. **Convaincre les agences membres** de laisser leurs conseillers exister
   publiquement comme individus indexables — friction politique interne énorme
   car les agences ne veulent pas que leurs conseillers soient "transférables"
   d'une agence à l'autre.
3. **Bâtir un brief structuré + scoring** testé et déterministe (Principe VI).
4. **Accepter de ne plus toucher à la transaction** ou créer une entité
   séparée non-OPC pour ce canal.

**Fenêtre stratégique estimée** : 12-24 mois avant qu'un acteur puisse répliquer
si on exécute correctement. Suffisant pour atteindre un seuil de notoriété
conseiller couvrant QC + ON.

---

## 5. Implications produit (calibre les specs en aval)

### Feature 002 — intake / préqualification

Le brief **DOIT** capturer (au-delà de destination/dates) :

- **Langue du conseiller souhaitée** (FR, EN, ES, autre) → MVMA n'a pas, on
  débloque les communautés latinos/anglophones QC mal servies.
- **Spécialité** (croisières, aventure, lune de miel, voyage famille avec
  enfants, voyage adapté mobilité réduite, etc.) → critère de matching n°1.
- **Budget fourchette** (< 2 k$, 2-5 k$, 5-10 k$, 10 k$+) → MVMA n'a pas, donc
  les conseillers reçoivent des leads non-qualifiés financièrement.
- **Flexibilité dates** (booléen ou nombre de jours d'amplitude) → important
  pour le matching avec les spécialistes "deal hunters".
- **Familiarité du voyageur** (premier grand voyage / habitué) → calibre la
  pédagogie du conseiller.

### Feature 003 — matching

Scoring déterministe testé Principe VI :

- Match exact spécialité = poids majeur
- Match langue = poids majeur (boolean killer)
- Match destination déjà vendue par conseiller dans 24 derniers mois = bonus
- Match budget compatible avec ticket moyen conseiller = bonus
- Conseiller actif < 7 jours sans nouveau lead = bonus distribution équitable

### Feature 004 — SEO / profils publics conseiller

`/conseillers/<slug>` indexable Google avec :

- Nom + photo + agence + années d'expérience + certif
- Spécialités + destinations expertes + langues
- 3-5 voyages exemples (texte court, pas affiliation directe)
- Reviews voyageurs (post-voyage déclaré, formulaire 30 s par lien email)
- Bouton "Demander cette personne" qui pré-remplit l'intake

C'est ce qui ramasse le SEO long-tail : `"conseiller voyage Pérou Montréal
espagnol"` → MVMA n'a aucune page qui répond à ça aujourd'hui.

### Feature 005 — reviews post-voyage

Lien email envoyé 7 jours après la date de retour déclarée par le conseiller.
Formulaire 30 s, étoiles + 1-3 phrases. Public sur le profil conseiller.

---

## 6. Risques et angles morts à surveiller

| Risque | Vraisemblance | Mitigation |
|---|---|---|
| VED ou TPI lance un vrai matching | Moyenne sur 12-24 mois | Vitesse d'exécution, NPS conseiller |
| Loi 25 / OPC change le cadre "mise en relation pure" | Faible | Veille trimestrielle, ADR si évolution |
| Pas assez de conseillers vérifiés au lancement (oeuf-poule) | **Élevée** | Plan acquisition conseiller ciblé : 50-100 vérifiés QC avant ouverture voyageur |
| Voyageur arrive seul et se plaint qu'aucun conseiller ne réponde | Élevée si SLO conseiller pas tenu | SLO "réponse < 24 h" affiché, fallback rappel automatique |
| Conseiller traite mal le lead (gâche le brief) | Moyenne | Système de feedback voyageur sur la réactivité, suspension auto si reviews < 3/5 |
| Captation du lead par un conseiller hors plateforme | Élevée | Frais facturés par lead accepté (pas par lead converti), donc le conseiller paie qu'on l'ait ou pas hors-plateforme |

---

## 7. Indicateurs nord-étoile

| Métrique | Cible 6 mois | Cible 18 mois |
|---|---|---|
| Conseillers vérifiés actifs (lead/mois) | 50 | 300 |
| Briefs voyageur soumis / mois | 100 | 2 000 |
| Taux de lead **accepté** par conseiller | 60 % | 70 % |
| Taux de lead → devis envoyé | 40 % | 55 % |
| Taux de lead → réservation déclarée | 12 % | 20 % |
| NPS conseiller (sur la plateforme) | +30 | +50 |
| % voyageurs FR-CA / EN / autre | 80 / 15 / 5 | 65 / 25 / 10 |

---

## 8. Ce que **nous ne sommes pas**

Important d'être clair pour éviter le scope creep :

- ❌ Une agence de voyage en ligne (Expedia, Costco Travel, Booking).
- ❌ Un comparateur de prix de vols/hôtels (Skyscanner, Kayak).
- ❌ Une marketplace de forfaits (Vacances Sunwing, Air Canada Vacances).
- ❌ Un CRM pour conseillers (Tess, ClientBase).
- ❌ Un réseau d'agences (VED, TPI, Travel Brands).
- ❌ Un courtier OPC/TICO titulaire d'un permis.

✅ Une **plateforme de mise en relation qualifiée** entre voyageurs francophones
canadiens et conseillers individuels vérifiés, mesurée par la qualité du lead
livré, hors de toute transaction monétaire.
