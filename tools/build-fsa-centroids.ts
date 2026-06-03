#!/usr/bin/env tsx
// T004 — Tool de génération packages/shared/src/matching/fsa-centroids.json.
//
// Source de données : Statistique Canada — Forward Sortation Area Boundary
// File, distribué sous Open Government Licence – Canada (cf. ADR-0022).
//
// Le shapefile officiel StatCan contient ~1 622 FSA canadiens (toutes provinces)
// avec leur géométrie polygonale. Ce script calcule le centroïde de chaque
// polygone et exporte un JSON minifié consommable par le module matching
// (cf. ADR-0021 — Haversine sur centroïdes).
//
// Usage :
//   pnpm tsx tools/build-fsa-centroids.ts
//
// Procédure annuelle (cf. docs/runbooks/matching-fsa-update.md — T090) :
//   1. Vérifier la version courante du fichier source (URL ci-dessous)
//   2. Mettre à jour SOURCE_URL si nouvelle release annuelle
//   3. pnpm tsx tools/build-fsa-centroids.ts
//   4. Vérifier diff : `git diff packages/shared/src/matching/fsa-centroids.json`
//   5. Tester en staging avant merge
//
// IMPORTANT : ce script nécessite un accès réseau et une dépendance
// optionnelle au package npm `shapefile` (ou équivalent) pour parser le .shp.
// En l'absence de réseau (build CI local, Phase 1 initiale), le fichier
// fixture bootstrap (40 FSAs métros principales) suffit pour les tests
// unitaires + l'amorce locale. La version complète 1 622 FSAs doit être
// régénérée avant merge production.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AdmZip from 'adm-zip';
import proj4 from 'proj4';
import { open as openShapefile } from 'shapefile';

// ---------------------------------------------------------------------------
// Configuration source
// ---------------------------------------------------------------------------

const SOURCE_URL =
  'https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lfsa000a21a_e.zip';
const SOURCE_VERSION = '2021'; // mise à jour annuelle approximative
const SOURCE_LICENSE = 'Open Government Licence – Canada';

// ---------------------------------------------------------------------------
// Format de sortie
// ---------------------------------------------------------------------------

interface FsaCentroidEntry {
  /** FSA — 3 caractères majuscule, ex. "H7N", "M5V" */
  fsa: string;
  /** Latitude WGS84 du centroïde */
  lat: number;
  /** Longitude WGS84 du centroïde */
  lng: number;
  /** Province ISO-3166-2:CA (ex. "QC", "ON") */
  province: string;
}

interface FsaCentroidFile {
  /** Métadonnées de génération */
  meta: {
    source: 'Statistique Canada — Forward Sortation Area Boundary File';
    sourceUrl: string;
    sourceVersion: string;
    license: string;
    generatedAt: string;
    generatedBy: 'tools/build-fsa-centroids.ts';
    fsaCount: number;
    isBootstrap: boolean;
  };
  /** Données centroïdes */
  entries: ReadonlyArray<FsaCentroidEntry>;
}

// ---------------------------------------------------------------------------
// Mode 1 — Téléchargement + parsing shapefile (production)
// ---------------------------------------------------------------------------

// StatCan boundary files sont projetés en NAD83 / Statistics Canada Lambert
// (EPSG:3347). On reprojette les centroïdes vers WGS84 (EPSG:4326) via proj4.
const EPSG_3347 =
  '+proj=lcc +lat_0=63.390675 +lon_0=-91.8666666666667 +lat_1=49 +lat_2=77 ' +
  '+x_0=6200000 +y_0=3000000 +datum=NAD83 +units=m +no_defs +type=crs';

// PRUID (code province StatCan) → ISO-3166-2:CA (sans préfixe `CA-`).
const PRUID_TO_ISO: Record<string, string> = {
  '10': 'NL',
  '11': 'PE',
  '12': 'NS',
  '13': 'NB',
  '24': 'QC',
  '35': 'ON',
  '46': 'MB',
  '47': 'SK',
  '48': 'AB',
  '59': 'BC',
  '60': 'YT',
  '61': 'NT',
  '62': 'NU',
};

type Ring = ReadonlyArray<readonly [number, number]>;

/** Centroïde + aire absolue d'un anneau via la formule signed-area. */
function ringCentroid(ring: Ring): { cx: number; cy: number; area: number } {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i] as readonly [number, number];
    const [x1, y1] = ring[i + 1] as readonly [number, number];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (twiceArea === 0) {
    // Anneau dégénéré → moyenne arithmétique des sommets en repli.
    const n = Math.max(1, ring.length);
    const sx = ring.reduce((s, p) => s + p[0], 0) / n;
    const sy = ring.reduce((s, p) => s + p[1], 0) / n;
    return { cx: sx, cy: sy, area: 0 };
  }
  const area = twiceArea / 2;
  return { cx: cx / (3 * twiceArea), cy: cy / (3 * twiceArea), area: Math.abs(area) };
}

/**
 * Centroïde projeté d'une géométrie (Multi)Polygon. Pour un MultiPolygon
 * (FSA avec parties disjointes — îles, enclaves), on retient le centroïde de
 * la PLUS GRANDE partie plutôt qu'une moyenne pondérée : cette dernière peut
 * tomber dans le vide entre deux morceaux. Le centroïde de la partie dominante
 * est garanti représentatif de la masse principale (point de référence géo).
 */
function geometryCentroid(geometry: GeoJSON.Geometry): { x: number; y: number } | null {
  const exteriorRings: Ring[] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates[0] as Ring]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates.map((poly) => poly[0] as Ring)
        : [];
  if (exteriorRings.length === 0) return null;

  let best: { x: number; y: number; area: number } | null = null;
  for (const ring of exteriorRings) {
    const { cx, cy, area } = ringCentroid(ring);
    if (best === null || area > best.area) {
      best = { x: cx, y: cy, area };
    }
  }
  return best === null ? null : { x: best.x, y: best.y };
}

/** Slice propre du Buffer Node vers un ArrayBuffer autonome (pool-safe). */
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function downloadStatCanZip(): Promise<AdmZip> {
  console.error(`📥 Téléchargement ${SOURCE_URL} (~21 MB)...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Téléchargement échoué : HTTP ${response.status} ${response.statusText}`);
  }
  const zipBuffer = Buffer.from(await response.arrayBuffer());
  console.error(
    `   ${Math.round(zipBuffer.length / 1024 / 1024)} MB téléchargés, décompression...`,
  );
  return new AdmZip(zipBuffer);
}

function extractShapefileParts(zip: AdmZip): { shp: ArrayBuffer; dbf: ArrayBuffer } {
  const entries = zip.getEntries();
  const findEntry = (ext: string) =>
    entries.find((e) => e.entryName.toLowerCase().endsWith(ext) && !e.isDirectory);
  const shpEntry = findEntry('.shp');
  const dbfEntry = findEntry('.dbf');
  const prjEntry = findEntry('.prj');
  if (!shpEntry || !dbfEntry) {
    throw new Error('Archive StatCan : .shp ou .dbf introuvable.');
  }
  const prj = prjEntry?.getData().toString('utf-8');
  if (prj && !/Lambert_Conformal_Conic/i.test(prj)) {
    console.error(
      `⚠  .prj inattendu (pas Lambert_Conformal_Conic) — vérifier la reprojection :\n${prj.slice(0, 200)}`,
    );
  }
  return { shp: toArrayBuffer(shpEntry.getData()), dbf: toArrayBuffer(dbfEntry.getData()) };
}

/** Convertit une feature shapefile en entrée FSA, ou null si non éligible. */
function featureToEntry(
  feature: GeoJSON.Feature,
  seen: ReadonlySet<string>,
): FsaCentroidEntry | null {
  const props = (feature.properties ?? {}) as Record<string, unknown>;
  const fsa = String(props.CFSAUID ?? '').toUpperCase();
  const province = PRUID_TO_ISO[String(props.PRUID ?? '')] ?? '';
  if (!FSA_REGEX.test(fsa) || province === '' || seen.has(fsa) || !feature.geometry) {
    return null;
  }
  const centroid = geometryCentroid(feature.geometry);
  if (!centroid) return null;
  const [lng, lat] = proj4(EPSG_3347, 'WGS84', [centroid.x, centroid.y]);
  return {
    fsa,
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    province,
  };
}

async function fetchAndParseStatCanShapefile(): Promise<FsaCentroidEntry[]> {
  const zip = await downloadStatCanZip();
  const { shp, dbf } = extractShapefileParts(zip);
  const source = await openShapefile(shp, dbf);

  const out: FsaCentroidEntry[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (;;) {
    const result = await source.read();
    if (result.done) break;
    const entry = featureToEntry(result.value as GeoJSON.Feature, seen);
    if (entry === null) {
      skipped += 1;
      continue;
    }
    seen.add(entry.fsa);
    out.push(entry);
  }

  console.error(`   ${out.length} FSAs parsées (${skipped} entrées ignorées).`);
  return out;
}

// ---------------------------------------------------------------------------
// Mode 2 — Bootstrap fixture (Phase 1 initiale, offline)
// ---------------------------------------------------------------------------

// 40 FSAs représentatives — métropoles principales par province.
// Centroïdes approximatifs (précision ~5-10 km) suffisants pour
// l'amorce des tests unit. À remplacer par les valeurs StatCan exactes
// avant merge production.
//
// Couverture : QC (Montréal, Laval, Québec) + ON (Toronto, Ottawa) +
// BC (Vancouver) + AB (Calgary, Edmonton) + MB (Winnipeg) + NS (Halifax) +
// SK + NB + NL + PE — sample multi-provincial pour les tests d'invariant.
const BOOTSTRAP_ENTRIES: ReadonlyArray<FsaCentroidEntry> = [
  // Québec — Montréal métropole
  { fsa: 'H1A', lat: 45.6515, lng: -73.5108, province: 'QC' },
  { fsa: 'H2X', lat: 45.5125, lng: -73.5658, province: 'QC' },
  { fsa: 'H2Y', lat: 45.5076, lng: -73.5577, province: 'QC' },
  { fsa: 'H3A', lat: 45.5048, lng: -73.5746, province: 'QC' },
  { fsa: 'H3B', lat: 45.5017, lng: -73.5673, province: 'QC' },
  { fsa: 'H3Z', lat: 45.4869, lng: -73.5841, province: 'QC' },
  { fsa: 'H4A', lat: 45.4685, lng: -73.6053, province: 'QC' },

  // Québec — Laval
  { fsa: 'H7N', lat: 45.5736, lng: -73.7239, province: 'QC' },
  { fsa: 'H7P', lat: 45.5495, lng: -73.7591, province: 'QC' },
  { fsa: 'H7T', lat: 45.5402, lng: -73.7341, province: 'QC' },
  { fsa: 'H7X', lat: 45.4977, lng: -73.8329, province: 'QC' },

  // Québec — Ville de Québec
  { fsa: 'G1A', lat: 46.7891, lng: -71.3179, province: 'QC' },
  { fsa: 'G1J', lat: 46.8233, lng: -71.2289, province: 'QC' },
  { fsa: 'G1V', lat: 46.7728, lng: -71.2756, province: 'QC' },
  { fsa: 'G2B', lat: 46.8631, lng: -71.3422, province: 'QC' },

  // Ontario — Toronto
  { fsa: 'M5V', lat: 43.6435, lng: -79.3954, province: 'ON' },
  { fsa: 'M4Y', lat: 43.6664, lng: -79.3833, province: 'ON' },
  { fsa: 'M5J', lat: 43.6435, lng: -79.3812, province: 'ON' },
  { fsa: 'M6P', lat: 43.6555, lng: -79.4564, province: 'ON' },
  { fsa: 'M1B', lat: 43.8067, lng: -79.1944, province: 'ON' },

  // Ontario — Ottawa
  { fsa: 'K1A', lat: 45.4215, lng: -75.6972, province: 'ON' },
  { fsa: 'K1P', lat: 45.4231, lng: -75.6877, province: 'ON' },
  { fsa: 'K2P', lat: 45.4087, lng: -75.6909, province: 'ON' },

  // British Columbia — Vancouver
  { fsa: 'V5K', lat: 49.2827, lng: -123.0476, province: 'BC' },
  { fsa: 'V6B', lat: 49.2812, lng: -123.1207, province: 'BC' },
  { fsa: 'V6Z', lat: 49.2769, lng: -123.1303, province: 'BC' },
  { fsa: 'V7Y', lat: 49.2916, lng: -123.1153, province: 'BC' },

  // Alberta — Calgary
  { fsa: 'T2P', lat: 51.0481, lng: -114.0708, province: 'AB' },
  { fsa: 'T3A', lat: 51.097, lng: -114.1408, province: 'AB' },

  // Alberta — Edmonton
  { fsa: 'T5J', lat: 53.5444, lng: -113.4909, province: 'AB' },
  { fsa: 'T6E', lat: 53.5232, lng: -113.4884, province: 'AB' },

  // Manitoba — Winnipeg
  { fsa: 'R3C', lat: 49.8951, lng: -97.1384, province: 'MB' },
  { fsa: 'R2M', lat: 49.8629, lng: -97.1186, province: 'MB' },

  // Saskatchewan — Saskatoon / Regina
  { fsa: 'S7N', lat: 52.1332, lng: -106.67, province: 'SK' },
  { fsa: 'S4P', lat: 50.4452, lng: -104.6189, province: 'SK' },

  // Nouvelle-Écosse — Halifax
  { fsa: 'B3J', lat: 44.6488, lng: -63.5752, province: 'NS' },
  { fsa: 'B3K', lat: 44.6594, lng: -63.5919, province: 'NS' },

  // Nouveau-Brunswick — Fredericton / Moncton
  { fsa: 'E3B', lat: 45.9636, lng: -66.6431, province: 'NB' },
  { fsa: 'E1C', lat: 46.0878, lng: -64.7782, province: 'NB' },

  // Terre-Neuve-et-Labrador — St. John's
  { fsa: 'A1C', lat: 47.5615, lng: -52.7126, province: 'NL' },

  // Île-du-Prince-Édouard — Charlottetown
  { fsa: 'C1A', lat: 46.2382, lng: -63.1311, province: 'PE' },
];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const FSA_REGEX = /^[A-Z]\d[A-Z]$/;
const CA_LAT_MIN = 41;
const CA_LAT_MAX = 84;
const CA_LNG_MIN = -141;
const CA_LNG_MAX = -52;

function failWith(message: string): never {
  console.error(message);
  process.exit(1);
}

function validateEntries(entries: ReadonlyArray<FsaCentroidEntry>): void {
  const fsaSet = new Set(entries.map((e) => e.fsa));
  if (fsaSet.size !== entries.length) {
    failWith('❌ Anomalie : FSAs dupliquées détectées.');
  }
  for (const entry of entries) {
    if (!FSA_REGEX.test(entry.fsa)) {
      failWith(`❌ FSA invalide : "${entry.fsa}"`);
    }
    if (entry.lat < CA_LAT_MIN || entry.lat > CA_LAT_MAX) {
      failWith(`❌ Latitude hors Canada pour ${entry.fsa} : ${entry.lat}`);
    }
    if (entry.lng < CA_LNG_MIN || entry.lng > CA_LNG_MAX) {
      failWith(`❌ Longitude hors Canada pour ${entry.fsa} : ${entry.lng}`);
    }
  }
}

async function loadEntries(useBootstrap: boolean): Promise<FsaCentroidEntry[]> {
  if (useBootstrap) {
    console.error(
      '⚠  Mode bootstrap (--bootstrap) — fixture de 40 FSAs métros principales. Pour la version production complète (1 622 FSAs), lancer sans --bootstrap (nécessite accès réseau + dépendance shapefile).',
    );
    return [...BOOTSTRAP_ENTRIES];
  }
  console.error(`📥 Téléchargement depuis ${SOURCE_URL}...`);
  const fetched = await fetchAndParseStatCanShapefile();
  if (fetched.length < 1500) {
    failWith(
      `❌ Anomalie : ${fetched.length} FSAs trouvées (attendu ≥ 1 500). Annulation pour éviter d'écraser le fichier complet avec un sample.`,
    );
  }
  return fetched;
}

function buildOutput(
  entries: ReadonlyArray<FsaCentroidEntry>,
  useBootstrap: boolean,
): FsaCentroidFile {
  return {
    meta: {
      source: 'Statistique Canada — Forward Sortation Area Boundary File',
      sourceUrl: SOURCE_URL,
      sourceVersion: SOURCE_VERSION,
      license: SOURCE_LICENSE,
      generatedAt: new Date().toISOString(),
      generatedBy: 'tools/build-fsa-centroids.ts',
      fsaCount: entries.length,
      isBootstrap: useBootstrap,
    },
    entries,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Phase 1 default = bootstrap. À la fin de l'implémentation, passer
  // `--production` pour générer la version complète depuis StatCan.
  const useBootstrap = !process.argv.includes('--production');
  const entries = await loadEntries(useBootstrap);
  validateEntries(entries);

  const output = buildOutput(entries, useBootstrap);
  const outputPath = resolve(process.cwd(), 'packages/shared/src/matching/fsa-centroids.json');
  writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

  console.error(`✅ ${entries.length} FSAs écrites dans ${outputPath}`);
  console.error(`   Mode : ${useBootstrap ? 'bootstrap' : 'production'}`);
  console.error(`   Taille : ~${Math.round(JSON.stringify(output).length / 1024)} KB`);
}

main().catch((err) => {
  console.error('❌ Erreur :', err);
  process.exit(1);
});
