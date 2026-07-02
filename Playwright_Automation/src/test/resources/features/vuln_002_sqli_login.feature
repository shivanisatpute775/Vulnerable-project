Feature: VULN-002 - SQL injection no longer bypasses login
  Background:
    Given the Spring Boot app is running on "http://localhost:8080"

  @security @vuln-002 @critical @regression
  Scenario: Valid credentials authenticate and return no password field
    When I POST `{"username":"alice","password":"alice123"}` to /api/login
    Then the response status is 200
    And the response JSON has field "username" with value "alice"
    And the response JSON does not have a "password" field

  @security @vuln-002 @critical @regression
  Scenario Outline: SQL injection payloads are rejected
    When I POST `{"username":"<payload>","password":"anything"}` to /api/login
    Then the response status is 401
    And the response JSON has field "error" with value "Invalid credentials"
    Examples:
      | payload               |
      | alice' OR '1'='1      |
      | admin'--              |
      | ' OR 1=1 --           |
      | alice'; DROP TABLE--  |

  @security @vuln-002 @critical @regression
  Scenario: Wrong password is rejected
    When I POST `{"username":"alice","password":"wrongPassword"}` to /api/login
    Then the response status is 401
