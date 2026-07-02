// Common steps — Background Given for every feature.
//
//  - "the Spring Boot app is running on <url>" pings / and /actuator/health
//    (whichever responds 2xx) to fail fast if the app isn't up.
//  - "seeded users X, Y, and Z exist" POSTs to /api/login with each user
//    and asserts a 200, proving the DB seeder ran.
//  - "HTTP Basic credentials for <user> are available" stores creds on
//    the world so the next call can include the Authorization header.

import { Given } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { installDialogTrap } from './hooks.js';

Given('the Spring Boot app is running on {string}', async function (baseUrl) {
  this.baseUrl = baseUrl;
  this.apiBase = `${baseUrl}/api`;
  const req = await this.ensureRequest();

  // Try a few lightweight endpoints so this works against both an
  // unauthenticated `/` (302 -> /login) and a 200 from /actuator/health.
  const candidates = [`${baseUrl}/`, `${baseUrl}/actuator/health`, `${baseUrl}/login`];
  let lastErr;
  for (const url of candidates) {
    try {
      const res = await req.get(url, { failOnStatusCode: false, timeout: 5000 });
      if (res.status() < 500) {
        this.lastStatus = res.status();
        return;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Spring Boot app not reachable at ${baseUrl} (tried ${candidates.join(', ')}). ` +
      `Start it with \`mvn spring-boot:run\` from the project root. ` +
      `Last error: ${lastErr?.message || 'unknown'}`,
  );
});

Given('seeded users {word}, {word}, and {word} exist', async function (a, b, c) {
  const req = await this.ensureRequest();
  const creds = [
    { user: a, pass: `${a}123` },
    { user: b, pass: `${b}123` },
    { user: c, pass: `${c}123` },
  ];

  for (const { user, pass } of creds) {
    const res = await req.post(`${this.apiBase}/login`, {
      headers: { 'Content-Type': 'application/json' },
      data: { username: user, password: pass },
      failOnStatusCode: false,
    });
    assert.equal(
      res.status(),
      200,
      `Seeded user ${user} did not authenticate (expected 200, got ${res.status()}). ` +
        `Did DataSeeder run? Body: ${await res.text().catch(() => '<unreadable>')}`,
    );
  }
});

Given('HTTP Basic credentials for {word} are available', async function (user) {
  // We don't actually call the server — we just remember the password so
  // the next `When I POST ... as <user>` step can build the header.
  // Passwords match DataSeeder.
  const passByUser = { alice: 'alice123', bob: 'bob123', admin: 'admin123' };
  const pass = passByUser[user];
  assert.ok(pass, `No seeded password known for user "${user}"`);
  // Note: don't set this.creds globally — the step that POSTs "as <user>"
  // will set it for the single call only.
  this._basicUser = user;
  this._basicPass = pass;
});

/**
 * Open a chromium browser and install the dialog trap. Returns the page.
 * Idempotent — re-uses this.browser if already up.
 */
export async function openBrowserWithTrap(world) {
  if (!world.browser) {
    world.browser = await chromium.launch({ headless: true });
    world.context = await world.browser.newContext({
      baseURL: world.baseUrl,
      ignoreHTTPSErrors: true,
    });
    world.page = await world.context.newPage();
    await installDialogTrap(world, world.page);
  }
  return world.page;
}
