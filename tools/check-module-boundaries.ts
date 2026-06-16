#!/usr/bin/env tsx
// T030a — Enforcement de la frontière modulaire (Principe V de la
// constitution). Fail le build si un fichier sous apps/api/src/modules/<X>/
// utilise un symbole Prisma préfixé par un autre module.
//
// Heuristique simple basée sur regex (pas d'analyse AST). Suffisant pour
// les cas usuels — quand un développeur tape `prisma.matching_lead.findUnique`
// dans le module conformite, c'est détecté.
//
// Pour étendre les préfixes : éditer MODULE_PREFIXES ci-dessous.

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const MODULES_ROOT = join(ROOT, 'apps', 'api', 'src', 'modules');

// Préfixes Prisma reconnus par module — à synchroniser avec data-model.md
// de chaque feature. Les modèles Prisma sont nommés en PascalCase
// (`ConformiteCertificat`) et les tables sont `snake_case` (`conformite_*`).
const MODULE_PREFIXES: Record<string, string[]> = {
  conformite: ['Conformite', 'conformite_'],
  // identité gère : auth (002+006), mfa (002a), legal (004), profil (007).
  identite: ['Auth', 'Profile', 'profile_'],
  intake: ['Intake', 'intake_'],
  matching: ['Matching', 'matching_'],
  facturation: ['Facturation', 'facturation_'],
  seo: ['Seo', 'seo_'],
};

// Symboles autorisés à traverser les frontières modulaires.
// Ce sont les CONTRATS PUBLICS de chaque module (au lieu de tout abstracter
// derrière une facade `XxxQueryFacade`, on liste les exceptions de design).
//
// `AuthGuard`, `AuthRole`, `AuthenticatedUser` du module identité sont des
// primitives d'authentification consommées par TOUS les modules métier
// (controllers + use cases). Les abstracter derrière une facade
// réintroduirait la complexité que cette liste évite.
//
// Quand on ajoute un nouveau contrat public à un module, on l'ajoute ici
// avec une justification dans le commentaire.
const ALLOWED_CROSS_MODULE_SYMBOLS: ReadonlySet<string> = new Set([
  // module identite — RBAC primitives
  'AuthGuard',
  'AuthRole',
  'AuthenticatedUser',
  'AuthenticatedRequest',
  'AuthSession',
  'AuthSessionReader',
  // intentionnellement laisser passer les types Auth* d'@prisma/client
  // (AuthUser, AuthAccount, etc.) car ils sont accédés via @cv/db qui est
  // le vendor neutre du schéma, pas directement via le module identité.
  'AuthUser',
  'AuthAccount',
  'AuthVerificationToken',
  // Feature 007 — types Prisma profil accédés via @cv/db (neutre vendor).
  // L'accès aux *use cases* profil reste interdit hors du module identité.
  'ProfilModerationAction',
  'OnboardingRelanceEtape',
  'PhotoUploadStatut',
  'StatutProfil',
  // ConformiteQueryPort + CONFORMITE_QUERY_PORT — port public exposé par
  // @cv/shared/conformite (façade publique), consommable par les modules
  // qui en ont besoin (identité feature 007 pour la jointure verified).
  'ConformiteQueryPort',
  'CONFORMITE_QUERY_PORT',
  // ConformiteQueryFacade est le nom de la classe publique elle-même —
  // référencé en commentaire pour la traçabilité (« la facade qui
  // implémente le port »), pas un import direct.
  'ConformiteQueryFacade',
  // ConformiteModule — import nécessaire pour le forwardRef() côté
  // IdentiteModule (feature 007 wiring T046). Le module entier est
  // importé pour résoudre la chaîne DI, pas pour consommer des internes.
  'ConformiteModule',
  // ConformiteStatusChanged + variantes — nom de l'event du domaine
  // conformité référencé en commentaire pour traçabilité dans les ports
  // profil (listener cross-module T061).
  'ConformiteStatusChanged',
  'ConformiteStatusChangedEvent',
  // Listener côté identité (feature 007 T061) — son nom contient
  // `Conformite` parce qu'il SOUSCRIT à un event conformité, mais il
  // appartient au module identité.
  'ConformiteStatusChangedListener',
  // Port et token de l'event publisher (souscription Redis pub/sub) —
  // exposé publiquement par conformité, consommé légitimement par
  // l'identité (T061).
  'ConformiteEventPublisher',
  'CONFORMITE_EVENT_PUBLISHER',
  'ConformiteDomainEvent',
  // ---------------------------------------------------------------------
  // Feature 011 matching — faux positifs de l'heuristique regex (T098).
  // ---------------------------------------------------------------------
  // Noms de tables intake/profil cités UNIQUEMENT dans des commentaires de
  // documentation des snapshot readers (data-model §5). L'accès Prisma réel
  // passe par les modèles neutres `voyageurBrief` / `conseillerProfile`
  // exposés par @cv/db (vendor neutre du schéma), pas par un symbole préfixé.
  'intake_voyageur_briefs',
  'intake_voyageur_contacts',
  'profile_conseiller_profiles',
  // Interface de requête locale du AdminMatchingController — même famille
  // que AuthenticatedRequest/AuthenticatedUser ci-dessus ; le préfixe `Auth`
  // est une collision de nommage, le type appartient au module matching.
  'AuthenticatedReq',
  // ---------------------------------------------------------------------
  // Feature 016 enrichissement LLM intake.
  // ---------------------------------------------------------------------
  // IntakeModule — importé par MatchingModule pour résoudre la chaîne DI du
  // port public BRIEF_ENRICHMENT_QUERY_PORT (composition enrichi → scoring,
  // T025). Même motif que `ConformiteModule` : import du module entier pour
  // le wiring DI, pas pour consommer des internes.
  'IntakeModule',
  // Port public d'enrichissement exposé par @cv/shared/intake (façade
  // publique), consommé par le matching (011) via le décorateur de snapshot.
  'BriefEnrichmentQueryPort',
  'BRIEF_ENRICHMENT_QUERY_PORT',
]);

interface Violation {
  file: string;
  importingModule: string;
  forbiddenSymbol: string;
  fromModule: string;
}

async function walkTs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkTs(full)));
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

function findFirstViolatingSymbol(content: string, prefix: string): string | null {
  const re = new RegExp(`\\b${prefix}\\w+`, 'g');
  for (const match of content.matchAll(re)) {
    if (!ALLOWED_CROSS_MODULE_SYMBOLS.has(match[0])) {
      return match[0];
    }
  }
  return null;
}

async function scanFile(file: string, currentModule: string): Promise<Violation[]> {
  const content = await readFile(file, 'utf-8');
  const violations: Violation[] = [];

  for (const [otherModule, prefixes] of Object.entries(MODULE_PREFIXES)) {
    if (otherModule === currentModule) continue;
    for (const prefix of prefixes) {
      const symbol = findFirstViolatingSymbol(content, prefix);
      if (symbol !== null) {
        violations.push({
          file: relative(ROOT, file),
          importingModule: currentModule,
          forbiddenSymbol: symbol,
          fromModule: otherModule,
        });
      }
    }
  }

  return violations;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// T043 — Pureté des packages domain. Les paquets `@cv/auth-domain`
// (feature 002) et `@cv/mfa` (feature 002a) sont des paquets TS pur,
// sans I/O, sans framework. Si un import interdit s'y glisse, le check
// échoue. Cf. Principe VIII (Clean Architecture).
//
// Pour étendre : ajouter des paquets dans DOMAIN_PACKAGES.

const DOMAIN_PACKAGES = ['auth-domain', 'mfa'];

const FORBIDDEN_DOMAIN_IMPORTS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly reason: string;
}> = [
  { pattern: /from\s+['"]@nestjs\//, reason: '@nestjs/* (framework backend)' },
  { pattern: /from\s+['"]@prisma\/client['"]/, reason: '@prisma/client (ORM)' },
  { pattern: /from\s+['"]@cv\/db['"]/, reason: '@cv/db (ORM wrapper)' },
  { pattern: /from\s+['"]next\//, reason: 'next/* (framework frontend)' },
  { pattern: /from\s+['"]next-auth/, reason: 'next-auth (Auth.js)' },
  { pattern: /from\s+['"]@auth\//, reason: '@auth/* (Auth.js v5)' },
  { pattern: /from\s+['"]react['"]/, reason: 'react (UI)' },
  { pattern: /from\s+['"]fastify['"]/, reason: 'fastify (server)' },
];

interface DomainPurityViolation {
  file: string;
  packageName: string;
  forbiddenImport: string;
  reason: string;
}

async function scanFileForForbiddenImports(
  file: string,
  pkg: string,
): Promise<DomainPurityViolation[]> {
  const content = await readFile(file, 'utf-8');
  const violations: DomainPurityViolation[] = [];
  for (const { pattern, reason } of FORBIDDEN_DOMAIN_IMPORTS) {
    const match = content.match(pattern);
    if (match) {
      violations.push({
        file: relative(ROOT, file),
        packageName: pkg,
        forbiddenImport: match[0],
        reason,
      });
    }
  }
  return violations;
}

async function pkgSrcRootIfExists(pkg: string): Promise<string | null> {
  const pkgRoot = join(ROOT, 'packages', pkg, 'src');
  try {
    const stats = await stat(pkgRoot);
    return stats.isDirectory() ? pkgRoot : null;
  } catch {
    return null;
  }
}

async function scanDomainPurity(): Promise<DomainPurityViolation[]> {
  const violations: DomainPurityViolation[] = [];
  for (const pkg of DOMAIN_PACKAGES) {
    const pkgRoot = await pkgSrcRootIfExists(pkg);
    if (!pkgRoot) continue;
    const files = await walkTs(pkgRoot);
    for (const file of files) {
      violations.push(...(await scanFileForForbiddenImports(file, pkg)));
    }
  }
  return violations;
}

async function listModules(): Promise<string[] | null> {
  try {
    const stats = await stat(MODULES_ROOT);
    if (!stats.isDirectory()) return null;
    return (await readdir(MODULES_ROOT, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
}

async function scanAllModules(modules: string[]): Promise<Violation[]> {
  const allViolations: Violation[] = [];
  for (const moduleName of modules) {
    const files = await walkTs(join(MODULES_ROOT, moduleName));
    for (const file of files) {
      allViolations.push(...(await scanFile(file, moduleName)));
    }
  }
  return allViolations;
}

function reportCrossModuleViolations(violations: Violation[]): void {
  process.stderr.write('\n❌ Cross-module boundary violations detected:\n\n');
  for (const v of violations) {
    process.stderr.write(
      `  ${v.file}\n    Module '${v.importingModule}' references '${v.forbiddenSymbol}' owned by module '${v.fromModule}'\n    → Use ${v.fromModule}'s public facade (e.g., ${capitalize(v.fromModule)}QueryFacade) instead.\n\n`,
    );
  }
}

function reportDomainPurityViolations(violations: DomainPurityViolation[]): void {
  process.stderr.write('\n❌ Domain package purity violations detected:\n\n');
  for (const v of violations) {
    process.stderr.write(
      `  ${v.file}\n    Package '@cv/${v.packageName}' imports forbidden: ${v.forbiddenImport}\n    → Reason: ${v.reason}. Move I/O / framework code to apps/api or apps/web.\n\n`,
    );
  }
}

async function main(): Promise<void> {
  const modules = await listModules();
  if (modules === null) {
    process.stdout.write('[check-module-boundaries] No modules directory yet, skipping.\n');
    return;
  }

  const crossModuleViolations = await scanAllModules(modules);
  const domainViolations = await scanDomainPurity();

  if (crossModuleViolations.length === 0 && domainViolations.length === 0) {
    process.stdout.write(
      `[check-module-boundaries] ✓ No cross-module Prisma imports (${modules.length} module(s) scanned).\n`,
    );
    process.stdout.write(
      `[check-module-boundaries] ✓ Domain packages pure (${DOMAIN_PACKAGES.join(', ')}).\n`,
    );
    return;
  }

  if (crossModuleViolations.length > 0) reportCrossModuleViolations(crossModuleViolations);
  if (domainViolations.length > 0) reportDomainPurityViolations(domainViolations);
  process.exit(1);
}

void main();
