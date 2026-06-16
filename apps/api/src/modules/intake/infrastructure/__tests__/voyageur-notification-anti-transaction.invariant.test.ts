// T011 [017 US1] — Invariant anti-PII / anti-marketplace du rendu courriel voyageur.
//
// ADR-0002 (anti-marketplace) + Loi 25 : les notifications voyageur ne doivent
// JAMAIS exposer une coordonnée de contact (courriel, téléphone), un montant /
// prix / paiement, ni un lien externe. Seuls prénom + spécialités publiques +
// le magic-link de suivi sont permis. Cet invariant est testé sur le HTML rendu.

import {
  VoyageurAdvisorsReadyEmail,
  VoyageurStillSearchingEmail,
} from '@cv/email-templates/intake';
import { render } from '@react-email/render';
import type * as React from 'react';
import { describe, expect, it } from 'vitest';

const TRACKING_URL = 'https://conseiller-voyage.ca/fr/voyage/abcdef0123456789';

// Détecte une adresse courriel (évite les faux positifs `@media`/`@keyframes`).
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
// Numéro de téléphone nord-américain (avec ou sans séparateurs).
const PHONE_RE = /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
// Montant / devise.
const MONEY_RE = /\$|€|\b\d+\s?(?:\$|CAD|EUR|euros?|dollars?)\b/i;
const FORBIDDEN_WORDS = [/\bprix\b/i, /\bpaiement\b/i, /\btarif/i, /\bréserv/i, /\bpayer\b/i];

const URL_RE = /https?:\/\/[^\s"'<)]+/g;
const HREF_RE = /href="([^"]+)"/g;

interface Rendered {
  readonly html: string;
  readonly text: string;
}

async function bothRenderings(node: React.ReactElement): Promise<Rendered> {
  return { html: await render(node), text: await render(node, { plainText: true }) };
}

function assertNoTransactionLeak({ html, text }: Rendered): void {
  // 1. Liens cliquables (HTML) : seul le magic-link de suivi (même hôte) est permis.
  for (const m of html.matchAll(HREF_RE)) {
    expect((m[1] ?? '').startsWith('https://conseiller-voyage.ca/')).toBe(true);
  }
  // 2. PII / transaction : sur le TEXTE VISIBLE (plainText) — exclut le CSS inline
  //    (couleurs hex, dimensions) qui produirait des faux positifs. On retire les
  //    URL (le token hex contient des chiffres piégeux).
  const body = text.replace(URL_RE, ' ');
  expect(EMAIL_RE.test(body)).toBe(false);
  expect(PHONE_RE.test(body)).toBe(false);
  expect(MONEY_RE.test(body)).toBe(false);
  for (const re of FORBIDDEN_WORDS) expect(re.test(body)).toBe(false);
}

describe('Invariant anti-transaction — courriel voyageur', () => {
  it('conseillers_prets : prénom + spécialités, aucune coordonnée/montant', async () => {
    const output = await bothRenderings(
      VoyageurAdvisorsReadyEmail({
        advisors: [
          { prenom: 'Marie', specialites: ['Voyages de noces', 'Asie'] },
          { prenom: 'Karim', specialites: ['Famille avec enfants'] },
        ],
        trackingUrl: TRACKING_URL,
        locale: 'fr-CA',
      }),
    );
    // Le contenu autorisé est bien présent.
    expect(output.text).toContain('Marie');
    expect(output.text).toContain('Voyages de noces');
    expect(output.text).toContain('Karim');
    assertNoTransactionLeak(output);
  });

  it('conseillers_prets (partiel) : invariant respecté', async () => {
    const output = await bothRenderings(
      VoyageurAdvisorsReadyEmail({
        advisors: [{ prenom: 'Sophie', specialites: ['Croisières'] }],
        trackingUrl: TRACKING_URL,
        locale: 'fr-CA',
        partiel: true,
      }),
    );
    assertNoTransactionLeak(output);
  });

  it('recherche_en_cours : ton rassurant, aucune coordonnée/montant', async () => {
    const output = await bothRenderings(
      VoyageurStillSearchingEmail({ trackingUrl: TRACKING_URL, locale: 'fr-CA' }),
    );
    assertNoTransactionLeak(output);
  });

  it('EN locale : invariant respecté aussi', async () => {
    const output = await bothRenderings(
      VoyageurAdvisorsReadyEmail({
        advisors: [{ prenom: 'Marie', specialites: ['Honeymoons'] }],
        trackingUrl: TRACKING_URL,
        locale: 'en',
      }),
    );
    assertNoTransactionLeak(output);
  });
});
