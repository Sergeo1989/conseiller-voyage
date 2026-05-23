# ADR-0002 — Pas de CTA de contact direct sur les pages publiques de conseillers

**Date** : 2026-05-22
**Statut** : accepté
**Décideurs** : porteur produit, équipe technique
**Documents liés** :
- [Constitution v2.0.0, Principe III — Qualité de lead avant volume](../../.specify/memory/constitution.md)
- [Roadmap produit](../roadmap.md) — features 005, 011, 015, 016, 018
- [Spec 001 — Module conformité](../../specs/001-conformite-module/spec.md)

---

## Contexte

Le modèle économique de la plateforme repose sur une **qualification
algorithmique du voyageur** :

1. Le voyageur décrit son projet via un formulaire d'intake.
2. La plateforme sélectionne jusqu'à 3 conseillers vérifiés alignés avec
   le besoin (Principe III, plafond non-négociable).
3. Le voyageur reçoit jusqu'à 3 soumissions et choisit.

La plateforme se rémunère via les **abonnements B2B conseillers** (modèle
SaaS, Principe I). Les conseillers paient parce qu'ils reçoivent des leads
**pré-qualifiés**, ce qui transforme leur ROI marketing par rapport à du
trafic non qualifié.

**Tension** : pour acquérir du trafic organique (Principe IV — SEO
francophone), la plateforme expose des pages publiques de conseillers
vérifiés (feature 016). Cette exposition crée un risque : si une page
conseiller affiche un bouton « contacter », « demander un devis », ou
équivalent, la plateforme dérive d'un service de concierge qualifié vers
un annuaire / marketplace, ce qui :

- Casse le plafond de 3 conseillers par demande (un voyageur peut en
  contacter 30 par navigation).
- Détruit la valeur produit (les conseillers ne paient plus pour du lead
  qualifié — ils sont en concurrence sur la présentation de profil).
- Introduit un biais de sélection « à la tête du client » (photo, bio
  plaisante) au lieu d'un alignement sur le besoin du voyageur.

---

## Décision

**Aucune page publique de conseiller ne comporte de CTA de contact direct.**

L'unique CTA actionnable sur une page publique de conseiller (ou sur tout
listing public de conseillers) est une redirection vers le formulaire
d'intake (`/intake`).

Conséquences concrètes pour les features de la roadmap qui exposent des
conseillers (005, 016, 018) :

1. **Pas de bouton** dont le texte ou l'action communique un contact
   direct : « Contacter », « Demander un devis », « Envoyer un message »,
   « Réserver une consultation », « Appelez Marie », etc., sont **interdits**.
2. **Pas de champ de contact affiché** : numéro de téléphone du conseiller,
   adresse courriel, lien LinkedIn de contact, formulaire de message
   adressé au conseiller, **interdits**.
3. **Pas de schéma JSON-LD `contactPoint` ni `telephone`** sur les pages
   conseiller — le seul `potentialAction` JSON-LD admis est une
   `SearchAction` ou `ReserveAction` qui pointe vers `/intake`.
4. **CTA unique acceptable**, à formuler explicitement : « Décrivez votre
   projet de voyage et nous vous mettrons en relation avec jusqu'à 3
   conseillers vérifiés qui répondent à votre besoin. Ce conseiller
   pourrait en faire partie. » Mène à `/intake`.
5. **Section permanente** sur chaque page conseiller : « Pourquoi je ne
   peux pas contacter ce conseiller directement ? » avec lien vers
   `/comment-ca-marche`, qui explique le modèle et renvoie à la page « Pas
   un agent de voyages » (feature 004).
6. **Page de listing thématique (feature 018)** : chaque carte conseiller
   renvoie à la page profil 016, jamais à un contact direct.

---

## Conséquences

**Positives** :

- **Plafond 3 conseillers (Principe III) inviolable au niveau navigation** :
  il ne suffit pas d'inscrire l'invariant dans le code de matching, encore
  faut-il qu'aucune route UX ne le contourne. Cet ADR garantit ce niveau de
  défense.
- **Valeur produit préservée** : les conseillers paient pour du lead
  qualifié algorithmique, pas pour du trafic public.
- **Anti-discrimination par défaut** : aucun voyageur ne choisit son
  conseiller sur la base de la photo, du nom ou de l'origine — le matching
  algorithmique évalue l'alignement avec le besoin.
- **Cohérence Principe I** : la plateforme reste explicitement une mise en
  relation, jamais un annuaire avec mise en contact directe (l'OPC pourrait
  considérer un annuaire facilitant la prise de contact directe comme une
  activité d'intermédiation, à éclaircir avec un avocat avant lancement —
  mais l'ADR met la plateforme du bon côté de la ligne par excès de
  prudence).
- **Acquisition SEO francophone (Principe IV) préservée** : les pages
  publiques individuelles restent indexables, captent la longue traîne
  (« conseiller voyage Marie Tremblay Montréal »), renforcent la confiance
  pré-intake. Pas de compromis sur ce canal.

**Négatives** :

- **Friction utilisateur intentionnelle** : un voyageur impatient peut
  trouver frustrant de ne pas pouvoir contacter directement quelqu'un qu'il
  a apprécié. La copy de la page conseiller et de la section explicative
  doit transformer cette friction en signal de qualité (« nous ne sommes
  pas un annuaire »).
- **Risque de fuite vers d'autres canaux** : un voyageur déterminé peut
  copier le nom du conseiller et chercher son contact ailleurs (Google,
  LinkedIn, agence d'affiliation). C'est acceptable — la plateforme ne peut
  pas empêcher la recherche externe, mais ne la facilite pas. Mitigation
  optionnelle : la page profil n'affiche pas le nom de l'agence du
  conseiller (pour ne pas faciliter la recherche externe), ou l'affiche
  comme information de conformité sans en faire un signal commercial.
- **Onboarding conseiller plus subtil** : un conseiller qui s'inscrit veut
  voir « à quoi ressemblera ma page ». Le pitch d'onboarding doit
  explicitement vendre le modèle « nous remplaçons votre acquisition Google
  Ads par du lead qualifié ; pas de contact direct, mais des leads chauds »
  — ce qui est en réalité un meilleur argument commercial.

---

## Alternatives considérées

### Option B — Annuaire général sans page individuelle

Pages de listing par thématique mais aucune page conseiller individuelle.

- **Avantages** : modèle concierge le plus pur, plafond 3 protégé par
  l'absence même de fiche individuelle.
- **Pourquoi rejetée** : perd la longue traîne SEO (requêtes par nom
  propre, requêtes locales), affaiblit la confiance pré-intake (pas de
  visage humain), désavantage compétitif par rapport à des concurrents qui
  exposent leurs experts.

### Option C — Profils visibles uniquement après matching

Aucune page conseiller publique. Le voyageur découvre ses 3 conseillers
dans la page de récap post-intake. SEO 100 % thématique.

- **Avantages** : modèle concierge encore plus pur.
- **Pourquoi rejetée** : SEO francophone (Principe IV) significativement
  affaibli, confiance pré-intake la plus faible, onboarding conseiller
  difficile à vendre (« vous serez invisible jusqu'à ce qu'un voyageur soit
  matché avec vous »).

### Option D — Pages publiques avec CTA direct (marketplace)

- **Avantages** : confiance maximale, conversion immédiate.
- **Pourquoi rejetée** : casse le modèle économique et le Principe III.
  Inacceptable. Décrite ici uniquement pour mémoire et pour que la décision
  de ne **jamais** y aller soit explicite.

---

## Application et gouvernance

- Tout PR qui introduit un élément interactif sur une page conseiller
  **DOIT** être revu contre cet ADR. Un revieweur qui voit un bouton
  « contacter » ou équivalent **DOIT** rejeter le PR sans appel.
- Tout futur spec (`/speckit.specify`) qui touche aux features 005, 011,
  015, 016, 018 ou à une nouvelle feature exposant un conseiller **DOIT**
  référencer cet ADR dans sa section *Constitution Check* et confirmer
  l'absence de CTA de contact direct.
- Un test e2e Playwright dédié dans `apps/web/test/e2e/anti-marketplace.spec.ts`
  vérifiera, à chaque CI, que les pages conseiller ne contiennent aucun
  élément `<a>`, `<button>` ou `<form>` dont le texte ou l'action exprime
  un contact direct. Liste noire évolutive maintenue dans le test.
- Toute proposition de revenir sur cet ADR **DOIT** faire l'objet d'un
  nouvel ADR (ADR-XXXX qui marque celui-ci comme « remplacé par »), avec
  amendement de la constitution si nécessaire.

---

## Références

- [Constitution v2.0.0](../../.specify/memory/constitution.md), Principes
  I (frontière réglementaire), III (qualité de lead avant volume), IV
  (français d'abord).
- [Spec 001 — Module conformité](../../specs/001-conformite-module/spec.md),
  FR-007 (filtrage matériel des conseillers non vérifiés).
- [Roadmap produit](../roadmap.md), Tier 1–3.
