# stepdefs/ — Cucumber-JS step definitions for the OWASP lab

This directory holds the JavaScript step-definition layer for the BDD suite.
It runs on top of the same `.feature` files in `src/test/resources/features/`
that the Java (Cucumber-JVM) suite uses — both stacks target the same Gherkin
contract and verify the same four P0/P1 remediations.

## Layout

| File                  | Responsibility                                                   |
|-----------------------|------------------------------------------------------------------|
| `world.js`            | `CustomWorld` extending `@cucumber/cucumber`'s `World`; carries `request`, `page`, `lastStatus`, `lastBody`, `lastHeaders`, `creds`, `dialogFired`, `baseUrl`. |
| `hooks.js`            | `Before`/`After` lifecycle + the **XSS dialog trap** (`page.on('dialog', ...)` that throws `AssertionError` on any alert/confirm/prompt). |
| `common_steps.js`     | Background Givens: "the Spring Boot app is running on …", "seeded users … exist", "HTTP Basic credentials for … are available". Exports `openBrowserWithTrap` for XSS. |
| `deserialize_steps.js`| TC-VULN-001 (POST JSON to /api/deserialize, POST base64 gadget chain, body assertions). |
| `login_steps.js`      | TC-VULN-002 (POST /api/login with valid / SQLi / wrong-password). |
| `idor_steps.js`       | TC-VULN-006 (anonymous, alice, admin hitting /api/users, /api/profile/{id}, /api/transfer). |
| `xss_steps.js`        | TC-VULN-007 (Playwright `page.greet`, h1 content, DOM script count, CSP header). |

## How state flows

- The `CustomWorld` is a fresh instance per scenario (cucumber-js default).
- `world.request` is built lazily on the first HTTP call so non-UI suites
  don't pay the cost of launching Chromium.
- `world.page` is opened only by `common_steps.js#openBrowserWithTrap` (used
  by the XSS stepdefs); the dialog trap is attached at that moment.
- Every `When` step that performs a request calls
  `world.captureResponse(response)` so subsequent `Then` steps can read
  `lastStatus` / `lastBody` / `lastHeaders` / `lastJson`.

## Auth

- `Given I am authenticated as <user> with password <pass>` stores
  `{ user, pass }` on `world.creds`. The next HTTP `When` step adds
  `Authorization: Basic <b64(user:pass)>` automatically via
  `world.authHeaders()`.
- "with no credentials" temporarily nulls `world.creds` for a single call
  (and restores it afterwards) so an anonymous request can be made even
  after a prior `Given` set creds.

## Running

From `Playwright_Automation/`:

```bash
npm install
npx playwright install chromium        # one-off, ~150 MB
npm test                                # full suite
npm run test:vuln-006                   # filter by tag
npm run report                          # regenerate HTML report
```

Pre-req: the Spring Boot lab must be running on `http://localhost:8080`
(start it from the parent project with `mvn spring-boot:run`).

## Why ESM?

`package.json` declares `"type": "module"`, so every file in this folder
uses `import` / `export` rather than CommonJS. This matches the rest of
the modern Node ecosystem and keeps the dep tree shallow.
