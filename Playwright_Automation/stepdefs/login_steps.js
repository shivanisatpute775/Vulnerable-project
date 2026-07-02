// VULN-002 — SQL injection no longer bypasses login.
//
// Three scenarios from vuln_002_sqli_login.feature:
//
//  1. Valid creds        -> 200, JSON has username=alice, NO password field
//  2. SQLi payload outline -> 401, JSON has error="Invalid credentials"
//  3. Wrong password     -> 401

import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

When(/^I POST `(.*)` to \/api\/login$/, async function (body) {
  const req = await this.ensureRequest();
  const res = await req.post(`${this.apiBase}/login`, {
    headers: { 'Content-Type': 'application/json' },
    data: body,
    failOnStatusCode: false,
  });
  await this.captureResponse(res);
});

Then('the response JSON has field {string} with value {string}', async function (field, value) {
  assert.ok(this.lastJson, `response was not JSON; body: ${this.lastBody}`);
  assert.equal(
    this.lastJson[field],
    value,
    `expected JSON[${JSON.stringify(field)}] === ${JSON.stringify(value)}, got ${JSON.stringify(this.lastJson[field])}; body: ${this.lastBody}`,
  );
});

Then('the response JSON does not have a {string} field', async function (field) {
  assert.ok(this.lastJson, `response was not JSON; body: ${this.lastBody}`);
  assert.ok(
    !(field in this.lastJson),
    `expected JSON to NOT have field ${JSON.stringify(field)}, but it did. body: ${this.lastBody}`,
  );
});
