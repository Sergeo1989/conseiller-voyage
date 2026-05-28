# Contract — `ConformiteNomLegalReader` (port ajouté au module conformité)

**Définition côté** : `identite` (port applicatif consommé)
**Implémentation côté** : `conformite` (adaptateur Prisma sur `DossierConformite`)
**Consommateurs** : `EditerProfilUseCase`, `LirePageProfilPubliqueUseCase`,
`LireProfilPriveUseCase`, `formaterNomAffiche` (via lecture upstream)

---

## Raison d'être

Cf. R9 (research.md). Le nom légal du conseiller (`prénom`, `nom`) est
vérifié au moment de l'approbation conformité (feature 001) et stocké
dans le `DossierConformite`. Le module identité ne doit PAS dupliquer
cette donnée (Principe II — minimisation + source unique). Ce port
expose une lecture en lecture seule.

---

## Signature TypeScript

```typescript
// apps/api/src/modules/identite/application/ports/conformite-nom-legal-reader.port.ts

export interface ConformiteNomLegalReader {
  /**
   * Lit le nom légal vérifié d'un conseiller à partir de son dossier
   * conformité approuvé. Retourne null si :
   *   - dossier inexistant
   *   - dossier en statut 'anonymized' (Loi 25)
   *   - dossier sans nom légal renseigné (cas pathologique pré-feature)
   */
  lireNomLegal(conseillerId: string): Promise<NomLegal | null>;
}

// Naming convention : on conserve `prenomLegal` / `nomLegal` pour
// expliciter qu'il s'agit du nom *vérifié officiellement* par la
// conformité (≠ d'un nom d'usage ou pseudonyme). Le format de stockage
// côté Prisma reste snake_case (`prenom_legal`, `nom_legal`).
export type NomLegal = {
  prenomLegal: string;   // tel que vérifié, FR-CA respect des accents
  nomLegal: string;
};
```

---

## Implémentation côté conformité

Fichier : `apps/api/src/modules/conformite/infrastructure/prisma-nom-legal-reader.ts`

```typescript
@Injectable()
class PrismaNomLegalReader implements ConformiteNomLegalReader {
  constructor(private prisma: PrismaService) {}

  async lireNomLegal(conseillerId: string): Promise<NomLegal | null> {
    const dossier = await this.prisma.dossierConformite.findUnique({
      where: { conseillerId },
      select: {
        prenomLegal: true,
        nomLegal: true,
        statut: true,
      },
    });

    if (!dossier) return null;
    if (dossier.statut === 'anonymized') return null;
    if (!dossier.prenomLegal || !dossier.nomLegal) return null;

    return {
      prenomLegal: dossier.prenomLegal,
      nomLegal: dossier.nomLegal,
    };
  }
}
```

**Note importante** : si les champs `prenomLegal` / `nomLegal` n'existent
pas encore dans le schéma `DossierConformite`, la migration
`20260527_extend_dossier_conformite_with_legal_names.sql` (cf.
data-model.md) les ajoute. Vérification recommandée avant
implémentation en ouvrant `specs/001-conformite-module/data-model.md`.

---

## Wiring

Dans `apps/api/src/modules/identite/identite.module.ts`, ajouter :

```typescript
{
  provide: CONFORMITE_NOM_LEGAL_READER,
  useClass: PrismaNomLegalReader,
}
```

Le `ConformiteModule` doit `export` ce provider. Le `IdentiteModule`
fait un `imports: [ConformiteModule]` (déjà en place pour
`ConformiteQueryPort`).

---

## Tests

| Test | Scénario |
|---|---|
| Dossier `verified` avec prenom + nom → retourne NomLegal | Nominal |
| Dossier `anonymized` → null | Loi 25 |
| Dossier inexistant → null | Fail-safe |
| Dossier `pending` avec noms renseignés → retourne NomLegal | (lecture autorisée même avant verified — l'affichage est gardé par `EstProfilPublic`) |
| Tentative lecture sans permission (RoleGuard upstream) | Couvert par le contrôleur, hors scope du port |

---

## Considérations de cache

Pas de cache au niveau du port (Postgres index sur `conseillerId` →
< 5 ms). Si une feature future remarque un hot path, un cache Redis
TTL 60 s peut être ajouté côté adaptateur sans changer l'interface.

---

## Considérations Loi 25

Le port retourne `null` quand le dossier est `anonymized` — c'est la
mécanique d'effacement cohérente : si le module conformité a anonymisé
le nom légal, le profil ne peut plus formater son nom affiché. En
pratique, le profil sera également `anonymise` côté identité au même
moment (orchestration via feature 023), donc ce cas est rare et géré
par fail-safe.
