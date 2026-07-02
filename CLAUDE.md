# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

OWASP Top 10 (2021) learning lab — Spring Boot 3 / Java 17 / Maven / H2 in-memory.
**Intentionally insecure.** Runs on `localhost:8080` only; never deploy. See `README.md`
for the rationale, demo payloads, and the OWASP-to-endpoint map.

> Despite the project name, the codebase is in a **partially remediated** state
> (`feature-2.1`). Source files carry `// VULNERABILITY:` markers that describe
> the *original* flaw and `REMEDIATION` Javadoc that describes the *applied* fix.
> Read both before changing anything — the comment about a "vulnerability" is
> often historical context for a now-fixed issue.

## Build & run

```bash
mvn -B -ntp -DskipTests package          # build the jar (CI uses -DskipTests)
mvn spring-boot:run                      # local dev run on :8080
mvn -B -q compile test-compile           # fast no-test compile check
```

There is **no `src/test` directory** — tests are intentionally skipped. CI runs
`mvn -B -ntp -DskipTests package` only. Do not add tests as part of routine work.

H2 console (`/h2-console`) is **off by default**. Enable for local poking with
`H2_CONSOLE_ENABLED=true`. JDBC URL `jdbc:h2:mem:owaspdb`, user `sa`, empty password.

Seeded users (all passwords BCrypt-hashed at startup in `DataSeeder`):
`alice/alice123` (USER), `bob/bob123` (USER), `admin/admin123` (ADMIN).

Secrets (`app.secret.api.key`, `app.secret.db.password`, `app.secret.jwt.signing.key`)
are wired in `SecretConfig` from `APP_SECRET_*` env vars with empty defaults —
the app starts fine without them. Do not commit literal secrets.

## Architecture

Single Maven module, package `com.owasp.lab`. Layered: `controller/` →
`service/` → `repository/` → `model/`, plus `config/` for Spring wiring and
`web/` for MVC glue.

- **`config/`** — `SecurityConfig` (the master filter chain), `PasswordConfig`
  (delegating BCrypt encoder), `SecretConfig` (env-var-backed beans),
  `JpaUserDetailsService` (load user for Spring Security), `DataSeeder`.
- **`controller/`** — two parallel surfaces for every domain:
  - **JSON `/api/*`** — `AuthController`, `UserController`, `ProductController`,
    `CommentController`, `InsecureDeserializationController`,
    `VulnerabilityController`. These are the original REST surface; curl/scripts
    use them.
  - **Browser Thymeleaf UI** — `UIController` (form-login pages, dashboard,
    products, users, comments, transfer), `VulnerabilityPageController`
    (Thymeleaf version of `/vulnerabilities`). `WebMvcConfig` redirects `/` →
    `/dashboard`.
  - `CommentViewController` renders HTML by string-concat — make sure it stays
    on `HtmlUtils.htmlEscape` for every user-controlled field.
- **`model/`** — `User` (still has a `password` field; comment documents it must
  never appear in a response), `Product`, `Comment` (body capped at 2000 chars).
- **`repository/`** — plain Spring Data JPA repositories. `UserRepository` also
  exposes `findByUsername` for `JpaUserDetailsService`.
- **`service/UserService`** — owns the two parameterized native queries
  (`findByUsernameUnsafe`, `loginUnsafe`). The `*Unsafe` names are historical;
  the queries are now `?` / `:username` bound.
- **`templates/`** — Thymeleaf views. Use `th:text`, never `th:utext`. Shared
  navbar/footer in `fragments/layout.html`.

### Security wiring (`SecurityConfig`)

- Filter chain order: authorize (allowlist public paths, everything else
  authenticated) → form login → HTTP Basic → `IF_REQUIRED` session → logout →
  content-type-aware entry point → CSRF (on by default) → defence-in-depth
  response headers (CSP, X-Frame-Options=sameOrigin, Referrer-Policy=NO_REFERRER,
  HSTS).
- **CSRF exempt**: `/h2-console/**`, `/api/login`, `/api/register`,
  `/api/transfer`. JSON `curl` callers rely on the Basic-auth stateless path;
  UI form posts carry the token automatically.
- **Public paths**: `/api/login`, `/api/register`, `/h2-console/**`, `/login`,
  `/logout`, `/css/**`, `/js/**`, `/error`. Everything else requires auth.
- **Roles**: stored as `USER`/`ADMIN` in the DB; `JpaUserDetailsService` maps
  them to `ROLE_USER`/`ROLE_ADMIN`. ADMIN-only checks live in controllers (see
  `UserController.listUsers` and `UIController.usersPage`).

### Vuln-class → file map

The remediation-Javadoc tags each fix with an ID like `VULN-001`. When asked
about a specific class of finding, start here:

- **IDOR / broken authZ** — `UserController` (`/api/profile/{id}`,
  `/api/users`), `AuthController` (`/api/transfer`), `UIController` (`/users`,
  `/transfer`).
- **SQL injection** — `UserService.findByUsernameUnsafe`, `loginUnsafe`. Both
  now use `EntityManager.createNativeQuery` with named parameters.
- **Plaintext passwords / hashing** — `PasswordConfig`, `User.password`,
  `DataSeeder`, `AuthController.register`, `UserService.loginUnsafe`.
- **XSS** — `CommentController.greet` (reflected), `CommentViewController`
  (stored). Both call `HtmlUtils.htmlEscape`.
- **CSRF** — `SecurityConfig` (`.csrf(csrf -> csrf.ignoringRequestMatchers(...))`).
- **Insecure deserialisation** — `InsecureDeserializationController` now parses
  untyped JSON via Jackson; `readObject` is gone.
- **Hardcoded secrets / misconfig** — `application.properties` (env-var
  placeholders, fail-on-unknown-properties, no stack traces, SQL logging off)
  and `SecretConfig`.

`ProductController.create` is still flagged as a `VULNERABILITY` (`A01` — anyone
can `POST /api/products`). This is a deliberate demo target; leave it unless
the user is explicitly running the remediation pipeline.

## Custom agents and commands (`.claude/`)

The repo carries a local security pipeline:

- `.claude/agents/vulnerability-scanner.md` — read-only static review, writes
  `SECURITY_ASSESSMENT_REPORT.md`.
- `.claude/agents/remediation-agent.md` — reads the assessment report, applies
  fixes via `Edit`, runs `mvn -B -q compile test-compile` after every change,
  reverts with `git checkout -- .` if it can't keep the build green, writes
  `SECURE_REMEDIATION_REPORT.md`. **It edits without asking the user.**
- `.claude/agents/git-agent.md` — chains a commit on a new
  `feature/safe-backup_<N>_<TIMESTAMP>` branch cut from the previous
  `feature/safe-backup_*` tip (never from `feature/safe-backup` itself), pushes
  to origin, writes `GIT_PUSH_REPORT.md`. Never merges to main.
- `.claude/commands/run-pipeline.md` — `/run-pipeline` slash command; runs
  scanner → remediation agent locally and writes both reports into
  `.claude/reports/` (overwriting any prior contents).

Reports land in `.claude/reports/`. Both `SECURITY_ASSESSMENT_REPORT.md` and
`SECURE_REMEDIATION_REPORT.md` are tracked in git; the rest of `.claude/reports/`
is ignored.

The `.claude/reports/` files in the working tree already reflect a prior
remediation run; do not re-run the pipeline unless the user asks.

## CI (`.github/workflows/build-and-security.yml`)

On push / PR to `main` or `master`: builds the jar with `-DskipTests`, then
runs the `vulnerability-scanner` agent via the Claude Code CLI (requires
`ANTHROPIC_API_KEY` repo secret), uploads the report as an artifact, and
commits `SECURITY_ASSESSMENT_REPORT.md` back to the branch if it changed.
