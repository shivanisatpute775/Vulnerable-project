// CustomWorld — the per-scenario state shared across step definition files.
//
// Carries:
//   - browser / context / page (Playwright) — only opened for VULN-007
//   - request (APIRequestContext)            — used for every REST call
//   - lastStatus / lastBody / lastHeaders    — most recent response snapshot
//   - creds                                  — { user, pass } for Basic auth
//   - dialogFired                            — set true if page.on('dialog') fires
//   - baseUrl                                — http://localhost:8080 (overridable)
//
// Steps read & write these fields directly. Nothing else is global; the
// CustomWorld instance is created fresh for every scenario by cucumber-js.

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { request as pwRequest } from '@playwright/test';

export class CustomWorld extends World {
  constructor(options) {
    super(options);

    // Configurable from the env, but defaults match the local Spring Boot run.
    this.baseUrl = process.env.BASE_URL || 'http://localhost:8080';
    this.apiBase = `${this.baseUrl}/api`;

    // Playwright handles; `request` is created lazily so non-UI scenarios
    // don't pay the cost of launching Chromium.
    this.browser = null;
    this.context = null;
    this.page = null;
    this.request = null;

    // Last response snapshot.
    this.lastResponse = null;
    this.lastStatus = null;
    this.lastBody = '';
    this.lastHeaders = {};

    // Auth: null = anonymous, otherwise { user, pass }.
    this.creds = null;

    // Set by the dialog trap (see stepdefs/hooks.js) the moment any
    // alert/confirm/prompt fires during a page interaction.
    this.dialogFired = false;
  }

  /**
   * Returns the APIRequestContext, creating it on first use. Always uses
   * the per-scenario baseUrl so tests don't leak state between runs.
   */
  async ensureRequest() {
    if (!this.request) {
      this.request = await pwRequest.newContext({ baseURL: this.baseUrl });
    }
    return this.request;
  }

  /**
   * Build headers for a request. If `extra` is provided it overrides.
   * Adds Authorization: Basic base64(user:pass) when creds are set.
   */
  authHeaders(extra = {}) {
    const headers = { ...extra };
    if (this.creds && !('Authorization' in headers)) {
      const token = Buffer.from(`${this.creds.user}:${this.creds.pass}`).toString('base64');
      headers['Authorization'] = `Basic ${token}`;
    }
    return headers;
  }

  /**
   * Capture a Playwright APIResponse into the last* fields so later
   * `Then` steps can assert against it.  Reads the body as text AND
   * tries to JSON-parse for convenience.
   */
  async captureResponse(response) {
    this.lastResponse = response;
    this.lastStatus = response.status();
    this.lastHeaders = response.headers();
    const text = await response.text().catch(() => '');
    this.lastBody = text;
    try {
      this.lastJson = text ? JSON.parse(text) : null;
    } catch {
      this.lastJson = null;
    }
  }

  async dispose() {
    if (this.request) {
      await this.request.dispose().catch(() => {});
      this.request = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
    this.page = null;
  }
}

setWorldConstructor(CustomWorld);
