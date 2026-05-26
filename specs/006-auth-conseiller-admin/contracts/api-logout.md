# Contrat — `POST /api/auth/logout`

**User Story** : US4 — Déconnexion (P1)
**FR couverts** : FR-027, FR-028, FR-033

## Auth

Authentifié (AuthGuard 002a). Une session valide est requise.

## Payload requête

Aucun (déduit du cookie de session courant).

## Réponses

### Succès

```http
HTTP/1.1 200 OK
Set-Cookie: __Host-cv.session.token=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict
Content-Type: application/json

{ "status": "ok" }
```

### Erreur (déjà déconnecté)

```http
HTTP/1.1 401 Unauthorized

{ "code": "NO_ACTIVE_SESSION" }
```

## Side effects

- DELETE `auth_sessions` WHERE `sessionToken = currentSessionToken` (FR-027 — courante seulement).
- Cookie de session effacé côté client (Set-Cookie Max-Age=0).
- INSERT `auth_audit_events` { eventType=logout, targetUserId, actorIp, metadata={ sessionTokenHash } }.

## Implémentation Auth.js v5 (clarification H9 review)

**Le chemin canonique côté UX est `signOut()` Auth.js v5.** Le bouton « Se déconnecter » du menu utilisateur Next.js appelle `signOut({ callbackUrl: '/connexion' })`, ce qui invoque la route `/api/auth/signout` exposée par Auth.js v5 côté Next.js — elle gère DELETE session + effacement cookie.

**La route NestJS `POST /api/auth/logout` documentée ci-dessus est conservée uniquement pour deux usages** :

1. **Tests d'intégration backend** : permettre à Vitest d'invalider explicitement une session de test sans passer par Auth.js v5 (qui implique le full setup Next.js).
2. **Future fonctionnalité « force-logout d'un utilisateur par un admin »** — un admin doit pouvoir, depuis la console interne, fermer toutes les sessions actives d'un utilisateur (cas d'incident sécurité). Cette fonctionnalité dépasse le scope 002, mais l'endpoint sera réutilisé avec ajout d'un guard `@RequireRole('admin')` et un paramètre `?userId=`.

**Au scope 002 strict**, la route NestJS est accessible uniquement avec une session valide (AuthGuard) — c'est l'utilisateur qui se déconnecte lui-même côté API. Documenter clairement dans le code que c'est un endpoint « technique / tests » et que l'UI n'a aucune raison de l'appeler directement (préférer `signOut()` Auth.js).

## Tests d'intégration

- ✅ Logout d'une session valide → 200 + DELETE session + audit
- ✅ Logout sans cookie → 401 NO_ACTIVE_SESSION
- ✅ Autres sessions du même user restent actives (FR-027)
- ✅ Tentative d'accès à `/conseiller` post-logout → 401 / redirect /connexion
