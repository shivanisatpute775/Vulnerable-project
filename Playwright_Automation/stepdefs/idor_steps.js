// VULN-006 — IDOR on profile and user listing is closed.
//
// Covers:
//   - Anonymous GET /api/users               -> 401
//   - alice   GET /api/users                 -> 403
//   - alice   GET /api/profile/2             -> 403  (someone else's profile)
//   - alice   GET /api/profile/1             -> 200, username=alice
//   - admin   GET /api/users                 -> 200, array contains alice/bob/admin
//   - admin   GET /api/profile/2             -> 200  (admin can read anyone)
//   - alice   POST /api/transfer fromId=2    -> 403  (cannot move bob's money)

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// The feature file uses concrete words, e.g.
// `Given I am authenticated as alice with password alice123`. We
// register a regex that captures both the user and the password.
Given(
  /^I am authenticated as (\w+) with password (\S+)$/,
  async function (user, pass) {
    this.creds = { user, pass };
  },
);

When(/^I GET (\/[^\s]+) with no credentials$/, async function (path) {
  // Force anonymous even if a previous step set creds.
  const saved = this.creds;
  this.creds = null;
  const req = await this.ensureRequest();
  const res = await req.get(`${this.baseUrl}${path}`, {
    failOnStatusCode: false,
  });
  await this.captureResponse(res);
  this.creds = saved;
});

// The feature file uses concrete paths in the When clause, e.g.
// `When I GET /api/users` and `When I GET /api/profile/1`. The Cucumber
// expression `I GET {string}` would not match those because the path
// contains `/` and digits. We register a regex that matches any path.
When(/^I GET (\/[^\s]+)$/, async function (path) {
  const req = await this.ensureRequest();
  const res = await req.get(`${this.baseUrl}${path}`, {
    headers: this.authHeaders(),
    failOnStatusCode: false,
  });
  await this.captureResponse(res);
});

When(/^I POST `(.*)` to \/api\/transfer$/, async function (body) {
  const req = await this.ensureRequest();
  const res = await req.post(`${this.apiBase}/transfer`, {
    headers: this.authHeaders({ 'Content-Type': 'application/json' }),
    data: body,
    failOnStatusCode: false,
  });
  await this.captureResponse(res);
});

Then('the response is a JSON array containing {string}, {string}, {string}', async function (a, b, c) {
  assert.ok(Array.isArray(this.lastJson), `expected JSON array, got ${typeof this.lastJson}; body: ${this.lastBody}`);
  // Each user is represented as an object with a "username" field. Be
  // tolerant of additional wrapping (the lab's listUsers returns
  // List<UserDto> with username, role, etc.).
  const usernames = this.lastJson.map((u) => (typeof u === 'string' ? u : u?.username));
  for (const name of [a, b, c]) {
    assert.ok(
      usernames.includes(name),
      `expected array to include ${JSON.stringify(name)}, got: ${JSON.stringify(usernames)}`,
    );
  }
});
