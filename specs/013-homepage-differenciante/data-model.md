# Data Model — Page d'accueil publique différenciante (013)

**Aucune entité persistée.** La feature n'introduit ni table, ni migration, ni stockage.
Le « modèle » est (a) l'arbre de clés i18n du contenu et (b) la forme de l'objet JSON-LD.

## 1. Contenu éditorial — namespace i18n `home.*` (FR-CA canonique)

Arbre de clés cible (étend l'existant ; valeurs FR-CA, EN différé 024) :

```
home
├── hero
│   ├── title            # H1 mandaté : « Décrivez votre voyage. On vous présente les 3
│   │                    #   conseillers vérifiés faits pour vous. »
│   └── subtitle         # « Indépendant de tout réseau. Aucun frais de plus qu'en ligne. »
├── ctaPrimary           # « Décrire mon voyage »  (réconcilie l'ancien « Décrire mon projet »)
├── trust
│   ├── opcTicoBanner    # « Tous vérifiés OPC/TICO »  (libellé exact à confirmer — R3)
│   └── dataResidency    # repris pour le bandeau Loi 25
├── pourquoiTrois
│   ├── heading          # « Pourquoi 3, et pas une liste »
│   ├── step1 / step2 / step3   # « Vous décrivez… » / « On compare selon vos critères… » /
│   │                           #   « Jusqu'à 3 conseillers choisis »
│   └── note             # « Pas une liste à trier soi-même. »
├── neutralite
│   ├── heading          # « Indépendant et neutre »
│   └── body             # multi-réseaux, indépendants compris, sans appartenance à un réseau
├── loi25
│   ├── heading          # (optionnel) intitulé du bandeau
│   └── body             # « Vos données restent au Canada. Aucun partage de vos
│                        #   coordonnées sans votre accord. »
├── pasDeContact
│   ├── heading          # « Pourquoi pas de contact direct ? »
│   ├── body             # explication modèle de mise en relation qualifiée
│   └── link             # libellé du lien → /comment-ca-marche
└── advisorAccess        # « Espace conseiller » (lien secondaire en-tête/pied)
```

**Règles** : toute chaîne visible provient d'une clé (FR-008) ; pluriels/ICU pour tout
comptage (ne pas affirmer « 3 » de façon absolue dans la copie secondaire — « jusqu'à 3 »,
FR-014). `en.json` reçoit les mêmes clés (repli FR acceptable jusqu'à 024).

## 2. Objet JSON-LD (sortie du builder pur `buildHomepageJsonLd`)

Deux nœuds, **sans** `contactPoint`/`telephone` (invariant ADR-0002, SC-007) :

```jsonc
// @type Organization
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Conseiller Voyage",
  "url": "<baseUrl>/<locale>",
  "logo": "<baseUrl>/<asset logo>",          // si disponible, sinon omis
  "areaServed": "CA",
  "knowsLanguage": ["fr-CA"]                  // EN ajouté avec 024
  // PAS de contactPoint, PAS de telephone, PAS d'email
}

// @type WebSite
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Conseiller Voyage",
  "url": "<baseUrl>/<locale>",
  "inLanguage": "fr-CA"
}
```

**Signature** : `buildHomepageJsonLd(locale: string, baseUrl: string): object[]` — fonction
pure, déterministe, sans I/O (testable, Principe VI). Le `baseUrl` provient de l'env public
(pas de secret).

## 3. État / transitions

Sans objet (page statique, anonyme, aucun état serveur ni client).
