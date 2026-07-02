// VULN-007 — Reflected XSS in /api/comment/greet is escaped.
//
// The endpoint returns an HTML page with the user's `name` query param
// embedded into an <h1>. After remediation, the value is HtmlEscape'd, so
// a `<script>` payload survives as literal text in the DOM. We verify:
//
//  1. Benign name renders as-is:                       h1 === "Hello, Alice!"
//  2. Script tag payload is escaped (NOT executed):    no alert dialog,
//                                                       h1 contains the literal
//                                                       "&lt;script&gt;..." markup,
//                                                       no <script> element
//  3. CSP header is set:                               default-src 'self'
//                                                       script-src 'self'
//
// Authentication: the lab's security config (VULN-005) requires every
// non-public endpoint to be authenticated. We open the browser with
// HTTP Basic auth in the context's extra headers so all navigations
// (including the XSS payload) carry `Authorization: Basic ...`. The
// expected behaviour — escaping, no execution, CSP — is unaffected by
// the auth header.

import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { installDialogTrap } from './hooks.js';

async function openBrowserAs(world, user, pass) {
  if (!world.browser) {
    world.browser = await chromium.launch({ headless: true });
    const headers = {};
    if (user) {
      headers['Authorization'] = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
    }
    world.context = await world.browser.newContext({
      baseURL: world.baseUrl,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: headers,
    });
    world.page = await world.context.newPage();
    await installDialogTrap(world, world.page);
  }
  return world.page;
}

// The feature file passes concrete paths with query strings, e.g.
// `I navigate to /api/comment/greet?name=Alice via Playwright`. These
// contain characters (`?`, `=`, `<`, `>`, `'`, `(`, `)`) that the
// default Cucumber `{string}` placeholder can't match, so we use a
// regex that captures the full path.
When(/^I navigate to (\S+) via Playwright$/, async function (pathWithQuery) {
  // Default to alice for the XSS suite. Tests can override by calling
  // the variant step below.
  const user = this._basicUser || 'alice';
  const credsByUser = { alice: 'alice123', bob: 'bob123', admin: 'admin123' };
  const pass = credsByUser[user];
  const page = await openBrowserAs(this, user, pass);
  const url = `${this.baseUrl}${pathWithQuery}`;
  // `waitUntil: 'load'` is the safest default — we want the inline HTML
  // fully parsed and the dialog trap to have had a chance to fire.
  const resp = await page.goto(url, { waitUntil: 'load' });
  // Capture the response so the CSP assertion below can read the headers.
  this.lastResponse = resp;
  this.lastStatus = resp ? resp.status() : null;
  this.lastHeaders = resp ? resp.headers() : {};
});

Then('the page h1 reads {string}', async function (expected) {
  const page = this.page;
  assert.ok(page, 'no page open; navigation step did not run');
  const h1 = await page.locator('h1').first().textContent();
  assert.equal(
    (h1 || '').trim(),
    expected,
    `expected h1 to be ${JSON.stringify(expected)}, got ${JSON.stringify((h1 || '').trim())}`,
  );
});

Then('the page h1 contains the literal text {string}', async function (expectedLiteral) {
  const page = this.page;
  assert.ok(page, 'no page open; navigation step did not run');
  // The escaped markup is a function of the input characters. For
  // `<script>alert('XSS')</script>` Spring's HtmlUtils.htmlEscape turns
  // it into `&lt;script&gt;alert(&#39;XSS&#39;)&lt;/script&gt;`. To be
  // robust we look at the rendered text via textContent (which
  // decodes the entities back to `<script>alert('XSS')</script>`) and
  // also fall back to innerHTML if a future refactor changes the
  // escaping strategy.
  const h1 = this.page.locator('h1').first();
  const text = (await h1.textContent()) || '';
  const html = (await h1.innerHTML()) || '';
  const ok = text.includes(expectedLiteral) || html.includes(expectedLiteral);
  assert.ok(
    ok,
    `expected h1 to contain ${JSON.stringify(expectedLiteral)}.\n  textContent: ${JSON.stringify(text)}\n  innerHTML:    ${JSON.stringify(html)}`,
  );
});

Then('no alert dialog is shown', async function () {
  // The dialog trap in hooks.js would have failed the scenario already if
  // a dialog had fired. This step is a no-op guard so the Gherkin reads
  // naturally — and it surfaces a clearer error if dialogFired slipped
  // through (e.g. the page wasn't opened via Playwright).
  assert.equal(
    this.dialogFired,
    false,
    'a browser dialog fired during the scenario — VULN-007 regressed',
  );
});

Then('no <script> element was injected into the DOM', async function () {
  const page = this.page;
  assert.ok(page, 'no page open; navigation step did not run');
  const count = await page.locator('script').count();
  // The lab's /greet response is a tiny inline HTML page with NO <script>
  // elements at all. Any count > 0 means a payload slipped through.
  assert.equal(
    count,
    0,
    `expected zero <script> elements in the DOM, found ${count}`,
  );
});

// The feature file uses {string} for the header snippet, e.g.
// `default-src 'self'`. The single-quote is a problem for some
// Cucumber expression parsers; we register a regex match instead.
Then(/^the response header (\S+) contains (.+)$/, async function (header, snippet) {
  const values = this.lastHeaders[header.toLowerCase()];
  assert.ok(values, `header ${header} missing from response; got: ${Object.keys(this.lastHeaders).join(', ')}`);
  // Strip optional surrounding quotes from the snippet.
  const want = snippet.replace(/^["']|["']$/g, '');
  // Headers can be combined with `,` (e.g. CSP). Match on the full list.
  assert.ok(
    values.includes(want),
    `expected header ${header} to contain ${JSON.stringify(want)}, got ${JSON.stringify(values)}`,
  );
});
