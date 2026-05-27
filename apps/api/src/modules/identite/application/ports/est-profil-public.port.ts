// T035 — Symbole DI NestJS pour EstProfilPublicPort.
//
// L'interface elle-même vit dans @cv/shared/profil-public pour être
// importable par les modules futurs (matching 011, SEO 016) sans
// dépendance au module identité.
//
// Le wiring concret PrismaEstProfilPublic (T045) implémente cette
// interface et est enregistré dans IdentiteModule (T046) puis exporté
// vers les autres modules qui en ont besoin.

export type { EstProfilPublicPort } from '@cv/shared/profil-public';

export const EST_PROFIL_PUBLIC_PORT = Symbol.for('EstProfilPublicPort');
