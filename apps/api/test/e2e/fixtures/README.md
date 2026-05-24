# Fixtures binaires pour les e2e

`dummy-cert.pdf` — un PDF minimal valide (~ 1 ko) utilisé comme
document de test. **À générer avant le premier run** des e2e :

```bash
# Option 1 — pdftk (si installé)
pdftk - cat output dummy-cert.pdf <<< "%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj
xref
0 4
0000000000 65535 f
0000000010 00000 n
0000000053 00000 n
0000000102 00000 n
trailer<</Size 4/Root 1 0 R>>
startxref
158
%%EOF"

# Option 2 — Node + pdfkit (depuis le repo)
node -e "
const PDFDocument = require('pdfkit');
const fs = require('fs');
const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('apps/api/test/e2e/fixtures/dummy-cert.pdf'));
doc.text('Test certificate — Playwright e2e fixture');
doc.end();
"
```

Le fichier est volontairement hors-git pour éviter les fixtures
binaires versionnées. Le job CI génère le fichier dans son setup.
