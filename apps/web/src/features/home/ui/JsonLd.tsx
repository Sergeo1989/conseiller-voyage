// Script JSON-LD inline (données structurées Schema.org). Encapsule l'unique
// usage maîtrisé de dangerouslySetInnerHTML : le contenu est sérialisé depuis
// des données construites côté serveur (i18n + builders purs), jamais une
// entrée utilisateur.

interface JsonLdProps {
  readonly data: unknown;
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD sérialisé depuis des données maîtrisées (pas d'entrée utilisateur)
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
