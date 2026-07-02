// VULN-001 — Insecure deserialization is removed.
//
// The lab's /api/deserialize used to call ObjectInputStream.readObject() on
// attacker-supplied base64 (ysoserial RCE). After remediation, the body is
// parsed by Jackson as a Map<String,Object>; the response is a small
// descriptor. We verify two scenarios:
//
//  1. Valid JSON        -> 200, body says Map<String,Object>, size=2
//  2. Binary gadget b64 -> NOT 200-with-instantiated-class, body does not
//                          contain "Deserialized:" and does not match the
//                          regex `Deserialized:\s+[a-zA-Z0-9_.$]+`.
//
// IMPORTANT: VULN-011 re-enabled CSRF for state-changing endpoints. The
// `/api/deserialize` POST is NOT in the CSRF-ignore list, so we need to
// fetch a CSRF token (and its JSESSIONID cookie) from the browser-side
// `/login` page first, then send the token as `X-CSRF-TOKEN` plus the
// cookie alongside the Basic-auth header. If CSRF were broken, the
// server would return 403.

import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { request as pwRequest } from '@playwright/test';

When(
  /^I POST `(.*)` to \/api\/deserialize with Content-Type application\/json as (\w+)$/,
  async function (body, user) {
    const req = await this.ensureRequest();
    // Per-user Basic auth, exactly like the JSON contract.
    const credsByUser = { alice: 'alice123', bob: 'bob123', admin: 'admin123' };
    const pass = credsByUser[user];
    assert.ok(pass, `No seeded password for user "${user}"`);
    const auth = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;

    // Acquire a CSRF token + session cookie from the browser login page.
    // The login page itself is public (no auth) and emits the token +
    // JSESSIONID; we then attach both to the POST.
    //
    // We use a FRESH request context here. If we reuse the scenario's
    // `this.request`, Playwright's APIRequestContext silently absorbs the
    // Set-Cookie into its cookie jar and stops returning it on subsequent
    // responses, breaking the JSESSIONID extraction below.
    const csrfReq = await pwRequest.newContext({ baseURL: this.baseUrl });
    const loginPage = await csrfReq.get(`${this.baseUrl}/login`, {
      failOnStatusCode: false,
    });
    assert.equal(
      loginPage.status(),
      200,
      `could not fetch CSRF token from /login (got ${loginPage.status()})`,
    );
    const html = await loginPage.text();
    const m = html.match(/name="_csrf"\s+value="([^"]+)"/);
    assert.ok(m, 'no _csrf input found on /login; cannot satisfy VULN-011');
    const csrfToken = m[1];
    // Pull the Set-Cookie JSESSIONID out of the response so the POST is
    // bound to the same session. `headersArray()` returns each header
    // separately — `headers()` collapses `Set-Cookie` into a single
    // comma-joined string, which is hard to parse.
    const setCookieHeaders = loginPage.headersArray().filter(
      (h) => h.name.toLowerCase() === 'set-cookie',
    );
    const setCookie = setCookieHeaders.map((h) => h.value).join('; ');
    const jsession = (setCookie.match(/JSESSIONID=([^;]+)/) || [])[1];
    await csrfReq.dispose();
    assert.ok(jsession, `no JSESSIONID cookie set by /login; got: ${setCookie || '<none>'}`);

    const res = await req.post(`${this.apiBase}/deserialize`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
        'X-CSRF-TOKEN': csrfToken,
        Cookie: `JSESSIONID=${jsession}`,
      },
      // The body is taken as a raw string from the Gherkin step so we can
      // send a base64 gadget chain as-is without JSON re-encoding it.
      data: body,
      failOnStatusCode: false,
    });
    await this.captureResponse(res);
  },
);

Then('the response status is {int}', async function (expected) {
  assert.equal(this.lastStatus, expected, `expected status ${expected}, got ${this.lastStatus}; body: ${this.lastBody}`);
});

Then('the response body contains {string}', async function (snippet) {
  assert.ok(
    this.lastBody.includes(snippet),
    `expected body to contain ${JSON.stringify(snippet)}, got: ${this.lastBody}`,
  );
});

Then('the response body contains "size":2', async function () {
  // The literal token the Gherkin carries is `"size":2` (no spaces).
  assert.ok(
    this.lastBody.includes('"size":2'),
    `expected body to contain "size":2, got: ${this.lastBody}`,
  );
});

Then('the response status is not 200 with an instantiated Java class', async function () {
  // The point of this assertion is: if a gadget chain DID instantiate a
  // Java class, the status would be 200 AND the body would look like
  // "Deserialized: java.lang.Runtime" or similar. We already check the
  // body shape below, so here we simply guard against the happy-path
  // 200-with-real-class outcome. A 400/415/500 with a parser error is
  // also acceptable.
  if (this.lastStatus === 200) {
    assert.ok(
      !/Deserialized:\s+[a-zA-Z0-9_.$]+/.test(this.lastBody),
      'status 200 with body that looks like an instantiated Java class — VULN-001 regressed',
    );
  }
});

Then('the response body does not contain {string}', async function (snippet) {
  assert.ok(
    !this.lastBody.includes(snippet),
    `expected body NOT to contain ${JSON.stringify(snippet)}, but it did. Body: ${this.lastBody}`,
  );
});

Then(/^the response body does not match `(.*)`$/, async function (pattern) {
  const re = new RegExp(pattern);
  assert.ok(
    !re.test(this.lastBody),
    `expected body NOT to match /${pattern}/, but it did. Body: ${this.lastBody}`,
  );
});

Then('the server does not instantiate any java.* class from the request', async function () {
  // Proxy: a successful ysoserial run prints `Deserialized: java.<fqcn>`.
  // We already cover that with the body regex, but this is a more readable
  // top-level assertion that the server didn't surface a class name.
  assert.ok(
    !/Deserialized:\s+java\./.test(this.lastBody),
    `server appears to have instantiated a java.* class; body: ${this.lastBody}`,
  );
});
