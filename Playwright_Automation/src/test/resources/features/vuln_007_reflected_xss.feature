Feature: VULN-007 - Reflected XSS in /api/comment/greet is escaped
  Background:
    Given the Spring Boot app is running on "http://localhost:8080"

  @security @vuln-007 @high @regression
  Scenario: Benign name renders normally
    When I navigate to /api/comment/greet?name=Alice via Playwright
    Then the page h1 reads "Hello, Alice!"

  @security @vuln-007 @high @regression
  Scenario: Script tag payload is escaped and not executed
    When I navigate to /api/comment/greet?name=<script>alert('XSS')</script> via Playwright
    Then no alert dialog is shown
    And the page h1 contains the literal text "&lt;script&gt;alert('XSS')&lt;/script&gt;!"
    And no <script> element was injected into the DOM

  @security @vuln-007 @high @regression
  Scenario: CSP defence-in-depth header is present
    When I navigate to /api/comment/greet?name=Alice via Playwright
    Then the response header Content-Security-Policy contains "default-src 'self'"
    And the response header Content-Security-Policy contains "script-src 'self'"
