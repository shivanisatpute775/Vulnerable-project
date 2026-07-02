// Hooks — per-scenario Playwright lifecycle + the XSS dialog trap.
//
// Why the trap matters
// -------------------
// Spring's HtmlUtils.htmlEscape() turns `<script>` into the literal text
// `&lt;script&gt;`. If a future regression ever drops that escape, the
// browser will execute the injected `<script>` and an `alert()` will fire.
// We attach `page.on('dialog', ...)` BEFORE any navigation: any alert /
// confirm / prompt dismisses itself, marks the world, and THROWS so the
// scenario fails immediately rather than passing on a string match alone.

import { Before, After, setDefaultTimeout } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(__dirname, '..', 'build', 'reports');

// 30s per step is plenty for a localhost REST call. Increase via env if CI
// is slow.
setDefaultTimeout(Number(process.env.CUCUMBER_TIMEOUT_MS || 30_000));

Before(async function () {
  // Pre-create the report directory so the formatter doesn't crash on a
  // clean checkout.
  mkdirSync(REPORT_DIR, { recursive: true });

  // Only spin up Chromium if the scenario actually drives a browser. Most
  // VULN-001/002/006 steps are pure HTTP; we open the browser lazily in
  // common_steps.js / xss_steps.js to keep them snappy.
});

After(async function (scenario) {
  // If the scenario reached us with dialogFired=true, the test should
  // already be failing, but log it for the report.
  if (this.dialogFired) {
    console.error(`[XSS-GUARD] ${scenario.pickle.name} — dialog event fired`);
  }

  await this.dispose();
});

/**
 * Install the dialog trap on a freshly opened page. Idempotent: calling it
 * twice on the same page replaces the previous listener instead of stacking.
 */
export async function installDialogTrap(world, page) {
  page.removeAllListeners('dialog');
  page.on('dialog', async (dialog) => {
    world.dialogFired = true;
    try {
      await dialog.dismiss();
    } catch {
      // dialog may already be auto-dismissed; ignore
    }
    // Throwing inside the dialog handler surfaces the XSS regression
    // immediately to the awaiting step.
    assert.fail(
      `Unexpected browser dialog fired: ${dialog.type()}("${dialog.message()}") ` +
        `— VULN-007 regressed; the lab is rendering unescaped user input.`,
    );
  });
  return page;
}

export { REPORT_DIR };
