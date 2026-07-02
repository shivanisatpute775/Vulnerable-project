// cucumber-js configuration. Loaded automatically by `npx cucumber-js`.
// Step definitions live in stepdefs/*.js. Feature files remain in their
// Java-suite location so both stacks share the same Gherkin contract.
export default {
  paths: ['src/test/resources/features/**/*.feature'],
  require: ['stepdefs/**/*.js'],
  format: [
    'progress',
    'html:build/reports/cucumber.html',
    'json:build/reports/cucumber.json',
  ],
  formatOptions: { snippetInterface: 'async-await' },
};
