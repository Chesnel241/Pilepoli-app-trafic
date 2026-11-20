import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown, privacyHtml } from '../src/legal.ts';

test('le Markdown de la politique devient du HTML propre', () => {
  const html = renderMarkdown('# Titre\n\nUn *mot* et **gras**.\n\n- un\n- <b>deux</b>\n\n## Suite\ntexte');
  assert.match(html, /<h1>Titre<\/h1>/);
  assert.match(html, /<em>mot<\/em>/);
  assert.match(html, /<strong>gras<\/strong>/);
  assert.match(html, /<ul>\n<li>un<\/li>\n<li>&lt;b&gt;deux&lt;\/b&gt;<\/li>\n<\/ul>/);
  assert.match(html, /<h2>Suite<\/h2>\n<p>texte<\/p>/);
});

test('la page publiée contient bien la politique', () => {
  assert.match(privacyHtml, /Pilepoil : confidentialité/);
  assert.match(privacyHtml, /Ta position/);
});
