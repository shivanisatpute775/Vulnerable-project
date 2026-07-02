# Playwright + Cucumber (BDD) Suite for the OWASP Lab

This module is a **dual-stack BDD suite** for the four P0/P1 OWASP
remediations applied to the Spring Boot lab in the parent project. The
suite targets `http://localhost:8080` only.

Two parallel implementations exist so you can pick whichever toolchain
you prefer — both verify the same `.feature` contract:

| Stack | Files | When to use |
|------|-------|-------------|
| **Java** (Cucumber-JVM + Playwright-Java + REST Assured) | `pom.xml`, `cucumber.properties`, `src/test/java/...` | You want one language with the SUT, and the Maven build system. |
| **JavaScript** (Cucumber-JS + `@playwright/test`) | `package.json`, `cucumber.js`, `playwright.config.js`, `stepdefs/` | You want a light Node-only run, or you're already in a JS toolchain. |

The JS suite is **additive** — it does not delete or replace the Java
suite. Pick one and run it; the other will stay green and ignored.

## Why Java?

The contract in `remediation_testcases.json` declares Java as the
step-definition language. Using the same language as the application under
test (Spring Boot 3 / Java 17) keeps CI simple, lets the suite share the
project's existing Maven repository, and avoids the JS/TS toolchain.

## Test coverage

| TC ID         | VULN ID   | OWASP class                                  | Surface |
|---------------|-----------|----------------------------------------------|---------|
| TC-VULN-001   | VULN-001  | A08 — Software & Data Integrity (Deserialization) | API  |
| TC-VULN-002   | VULN-002  | A03 — Injection (SQLi auth bypass)            | API    |
| TC-VULN-006   | VULN-006  | A01 — Broken Access Control (IDOR)            | API    |
| TC-VULN-007   | VULN-007  | A03 — Injection (Reflected XSS)               | Browser |

The first three are pure REST tests (REST Assured). TC-VULN-007 drives a
real Chromium via Playwright so it can inspect the live DOM after Spring has
HtmlEscape'd the name parameter.

## Prerequisites

1. **JDK 17** on `PATH`.
2. **Maven 3.8+** on `PATH`.
3. The Spring Boot lab built and running on `localhost:8080`.

## Running

```bash
# 1. In a separate terminal, start the lab:
cd /Users/macbookair/Downloads/vulnerable-springboot-app-feature-2.1
mvn spring-boot:run
# (wait for "Started Application")

# 2. In another terminal, run the suite:
cd /Users/macbookair/Downloads/vulnerable-springboot-app-feature-2.1/Playwright_Automation
mvn test
```

On first run, Playwright downloads Chromium (~150 MB) into
`~/.cache/ms-playwright/`. After that, `mvn test` works offline.

## Filtering by tag

The default Cucumber filter is `@security and not @wip`, configured in
both `cucumber.properties` and `RunCucumberTest.java`. To run a single case:

```bash
mvn test -Dcucumber.filter.tags="@vuln-006"
mvn test -Dcucumber.filter.tags="@vuln-001"
mvn test -Dcucumber.filter.tags="@vuln-007 and @regression"
```

## Authentication

The lab is intentionally insecure and ships three seeded users. They are
referenced by name in the Gherkin and the headers are the public
Basic-auth values from the JSON contract:

| User  | Password   | Role  |
|-------|------------|-------|
| alice | alice123   | USER  |
| bob   | bob123     | USER  |
| admin | admin123   | ADMIN |

Seeded user IDs (from `DataSeeder`): `aliceId=1`, `bobId=2`, `adminId=3`.
These are used in TC-VULN-006's IDOR checks.

## Project layout

```
Playwright_Automation/
  pom.xml                                       # Maven build
  cucumber.properties                           # classpath-level Cucumber config
  playwright.config.properties                  # Playwright + base URL config
  src/test/resources/
    cucumber.properties                         # mirror (so IDEs find it)
    playwright.config.properties                # mirror
    simplelogger.properties                     # slf4j-simple defaults
    features/
      vuln_001_deserialization.feature
      vuln_002_sqli_login.feature
      vuln_006_idor.feature
      vuln_007_reflected_xss.feature
  src/test/java/com/owasp/lab/bdd/
    RunCucumberTest.java                        # JUnit + CucumberOptions
    config/PlaywrightConfig.java                # property loader
    stepdefs/
      CommonSteps.java                          # shared Given / After
      Hooks.java                                # Playwright lifecycle, dialog trap
      DeserializeSteps.java                     # TC-VULN-001
      LoginSteps.java                           # TC-VULN-002
      IdorSteps.java                            # TC-VULN-006
      XssSteps.java                             # TC-VULN-007
      CapturedResponse.java                     # Playwright -> REST-Assured shim
```

## Reports

After a run, open:

- `build/reports/cucumber.html` — human-readable HTML
- `build/reports/cucumber.json` — machine-readable JSON (for downstream tools)

## XSS guard rail

`Hooks#openContext` installs `page.onDialog(...)` that **throws
`AssertionError` on any browser alert / confirm / prompt**. This is the
strongest signal that a reflected XSS regressed: if a `<script>` payload
ever executes, the suite fails immediately rather than waiting for a
flaky DOM assertion.

## JavaScript suite (Cucumber-JS + @playwright/test)

Lives next to the Java suite. Step definitions are in `stepdefs/` at
the project root (not under `src/test/`); feature files are the same
ones the Java suite consumes.

### Install

```bash
cd /Users/macbookair/Downloads/vulnerable-springboot-app-feature-2.1/Playwright_Automation
npm install
npx playwright install chromium     # ~150 MB, one-off
```

### Run

Pre-req: the Spring Boot lab is up on `:8080` (start it with
`mvn spring-boot:run` from the parent project).

```bash
npm test                  # full suite — @security and not @wip
npm run test:vuln-001
npm run test:vuln-002
npm run test:vuln-006
npm run test:vuln-007
npm test -- --tags '@vuln-007 and @regression'   # any ad-hoc tag expression
npm run report            # regenerate build/reports/cucumber-js.html
```

Reports land in `build/reports/cucumber.html`, `cucumber.json`, and
`cucumber-js.html` (the third one is produced by `cucumber-html-reporter`
via `npm run report`).

### What the JS suite adds

- Same four TC-VULN cases — verify the same behaviours, in the same
  Gherkin scenarios.
- Uses `@playwright/test`'s `request` (`APIRequestContext`) for HTTP,
  and `playwright.chromium` for the VULN-007 browser case. No axios,
  no fetch, no REST Assured.
- ESM (`"type": "module"`), no Babel/TS toolchain, no transpile step.
- The XSS dialog trap is the same as the Java suite's: any
  `alert/confirm/prompt` dismisses itself AND throws `AssertionError`
  via `page.on('dialog', ...)` in `stepdefs/hooks.js`.

### Layout

```
Playwright_Automation/
  package.json
  cucumber.js                            # cucumber-js config (requires stepdefs/*.js)
  playwright.config.js                   # @playwright/test config (consumed by world.js)
  scripts/
    make-html-report.js                  # `npm run report` entrypoint
  stepdefs/
    README.md
    world.js                             # CustomWorld: page, request, lastResponse, creds, dialogFired
    hooks.js                             # Before/After + dialog trap
    common_steps.js                      # Background Givens + openBrowserWithTrap
    deserialize_steps.js                 # TC-VULN-001
    login_steps.js                       # TC-VULN-002
    idor_steps.js                        # TC-VULN-006
    xss_steps.js                         # TC-VULN-007
  src/test/resources/features/           # shared with the Java suite
    vuln_001_deserialization.feature
    vuln_002_sqli_login.feature
    vuln_006_idor.feature
    vuln_007_reflected_xss.feature
```

The feature files were tweaked to escape JSON braces as `{string}`
placeholders (Cucumber can't parse literal `{}` in step text). The
intent is unchanged — see the unified diff in the project's git log
or the test report for the exact before/after.
