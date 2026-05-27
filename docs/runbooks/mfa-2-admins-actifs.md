# Runbook — Politique « ≥ 2 admins actifs en permanence »

**Statut** : actif depuis livraison feature 005
**Owner** : équipe ops + porteur produit
**Documents liés** :
- [Spec 005 § FR-026a, FR-026b](../../specs/005-mfa-conseiller/spec.md)
- [Plan 005 § Observabilité (Principe VII)](../../specs/005-mfa-conseiller/plan.md)
- [Clarifications session 2026-05-25 — Récupération MFA admin verrouillé](../../specs/005-mfa-conseiller/spec.md)

---

## Politique

À tout moment, la plateforme **DOIT** disposer d'au moins **2 utilisateurs
avec rôle `admin`, MFA TOTP enrôlé (`enabledAt IS NOT NULL`) et compte
non supprimé/révoqué (`deletedAt IS NULL`)**.

C'est une contrainte **organisationnelle**, pas logicielle. La plateforme
n'empêche pas qu'un admin reset le MFA du dernier autre admin — elle
affiche un avertissement (FR-026b) mais autorise l'action. La défense
finale est procédurale : un admin qui veut reset ne le fait qu'après
accord hors-bande avec l'admin cible (téléphone direct).

---

## Pourquoi cette politique ?

Sans cette politique, l'unique admin restant pourrait perdre son MFA
(device perdu + backup codes perdus) → personne ne peut le réinitialiser
→ break-glass DB direct obligatoire (cf.
[`mfa-break-glass-db.md`](mfa-break-glass-db.md)).

Avec 2 admins actifs, on a un fallback humain interne : si admin A perd
son MFA, admin B peut le reset après vérification hors-bande (US4 de
005). Aucune intervention infra requise.

---

## Vérification rapide

### Compteur live (Grafana)

Dashboard : *MFA Security* (cf. T124 de 005)
Panel : `cv_active_admins_total` (gauge)

- Seuil **critical** : valeur < 2 → alerte immédiate Slack/PagerDuty
- Seuil **warning** : valeur = 2 → alerte daily digest (proche de la limite)

### Commande SQL de vérification

```sql
SELECT u.id, u.email, u.role,
       s.enabledAt AS mfa_enabled_at,
       s.lastUsedAt AS mfa_last_used_at,
       u.deletedAt
FROM auth_users u
LEFT JOIN mfa_secrets s ON s.userId = u.id
WHERE u.role = 'admin'
  AND u.deletedAt IS NULL
ORDER BY u.email;
```

Compter le nombre de lignes avec `mfa_enabled_at IS NOT NULL`. Ce
nombre doit être ≥ 2.

### Endpoint API admin

`GET /api/admin/active-admins-count`
- Auth : cookie session admin + TOTP frais
- Réponse : `{ "activeAdminsCount": <number> }`
- Cache : 60 s en mémoire process (R10 de 005)

---

## Procédure de réinscription d'un admin perdu

### Cas 1 — Admin A perd device + backup codes, admin B actif disponible

1. Admin A contacte admin B par téléphone (numéro déclaré à l'embauche).
2. Admin B authentifie admin A hors-bande :
   - Vérifier identité par appel sur le numéro déclaré
   - Échange courriel professionnel attestant de la demande
   - Optionnel : visio + carte d'identité avec photo
3. Admin B navigue dans la console admin :
   `https://app.conseiller-voyage.ca/admin/users/<adminA_uuid>/reset-mfa`
4. Admin B saisit une justification ≥ 20 caractères (texte intégral
   archivé dans `mfa_audit_events`), par exemple :
   > "Reset MFA admin A demandé par téléphone le 2026-MM-DD à HH:MM,
   > après échange courriel pro confirmant la perte de son téléphone.
   > Identité vérifiée par appel sortant sur numéro fiche RH."
5. Admin B confirme. Le système :
   - Avertit visuellement si le compteur d'admins actifs vaut 2 avant
     l'action (FR-026b — risque de tomber à 1 si admin A reste
     bloqué)
   - DELETE le `MfaSecret` + cascade backup codes de admin A
   - DELETE toutes les sessions de admin A
   - Audit `mfa_reset_by_admin` immuable
   - Courriel transactionnel à admin A
6. Admin A se reconnecte → redirigé vers `/admin/mfa/enroll` → refait
   l'enrôlement TOTP complet.

### Cas 2 — Admin A perd MFA, admin B aussi (perte simultanée)

Voir [`mfa-break-glass-db.md`](mfa-break-glass-db.md) (procédure de
dernier recours, accès DB direct).

### Cas 3 — Un seul admin existait au moment de la perte

Ne devrait jamais arriver si la politique est respectée. Si ça arrive :
voir cas 2.

---

## Audit régulier (mensuel)

Une fois par mois, un membre de l'équipe ops exécute :

```sql
SELECT COUNT(*) AS active_admins
FROM auth_users u
INNER JOIN mfa_secrets s ON s.userId = u.id AND s.enabledAt IS NOT NULL
WHERE u.role = 'admin' AND u.deletedAt IS NULL;
```

Si résultat < 2 :
1. Identifier les admins existants (`SELECT … WHERE role='admin'`)
2. Confirmer avec chacun qu'il a bien son MFA actif (test au login)
3. Si manque effectif d'admin : recruter / promouvoir avant fin du mois
4. Documenter l'incident dans `docs/incidents/` (en cours de définition)

---

## Onboarding nouvel admin

Procédure : voir [`docs/processes/admin-onboarding.md`](../processes/admin-onboarding.md)
(à créer lors de l'implémentation de la feature 002 — auth conseiller +
admin de base).

Points clés MFA (005) :
- L'admin nouvellement créé est bloqué sur `/admin/mfa/enroll` à sa
  première connexion (US5 de 005).
- Doit compléter l'enrôlement (QR + premier code TOTP + sauvegarde des
  10 backup codes) avant tout accès à la console.
- Recommandé : sauvegarder le QR code dans 1Password (vault équipe)
  pour permettre la restauration sur un nouveau device sans passer par
  l'auto-service device change.
