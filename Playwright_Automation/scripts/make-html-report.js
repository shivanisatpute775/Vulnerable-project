// Standalone HTML report generator.
//
// Reads build/reports/cucumber.json (produced by cucumber-js) and writes a
// pretty HTML file at build/reports/cucumber-js.html. Uses
// cucumber-html-reporter which Cucumber ships a CLI for, but we wrap it in
// a small script so `npm run report` works without an extra global install.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import reporter from 'cucumber-html-reporter';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = resolve(__dirname, '..', 'build', 'reports');
const JSON_PATH = resolve(REPORT_DIR, 'cucumber.json');
const HTML_PATH = resolve(REPORT_DIR, 'cucumber-js.html');

if (!existsSync(JSON_PATH)) {
  console.error(`No cucumber.json found at ${JSON_PATH}. Run \`npm test\` first.`);
  process.exit(1);
}

const json = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
// Strip BOM if present.
if (json && json[0] && json[0].uri && json[0].uri.charCodeAt(0) === 0xfeff) {
  json[0].uri = json[0].uri.slice(1);
}

reporter.generate({
  jsonFile: JSON_PATH,
  output: HTML_PATH,
  reportSuiteAsScenarios: true,
  launchReport: false,
  metadata: {
    App: 'OWASP Top 10 Lab',
    BaseURL: process.env.BASE_URL || 'http://localhost:8080',
    Stack: 'Cucumber-JS + @playwright/test',
    Date: new Date().toISOString(),
  },
});

console.log(`HTML report written to ${HTML_PATH}`);
