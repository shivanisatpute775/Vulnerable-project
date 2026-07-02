Feature: VULN-006 - IDOR on profile and user listing is closed
  Background:
    Given the Spring Boot app is running on "http://localhost:8080"
    And seeded users alice, bob, and admin exist

  @security @vuln-006 @critical @regression
  Scenario: Anonymous user is denied access to /api/users
    When I GET /api/users with no credentials
    Then the response status is 401

  @security @vuln-006 @critical @regression
  Scenario: Non-admin user cannot enumerate all users
    Given I am authenticated as alice with password alice123
    When I GET /api/users
    Then the response status is 403

  @security @vuln-006 @critical @regression
  Scenario: User cannot read another user's profile
    Given I am authenticated as alice with password alice123
    When I GET /api/profile/2
    Then the response status is 403

  @security @vuln-006 @critical @regression
  Scenario: User can read their own profile
    Given I am authenticated as alice with password alice123
    When I GET /api/profile/1
    Then the response status is 200
    And the response JSON has field "username" with value "alice"

  @security @vuln-006 @critical @regression
  Scenario: Admin can enumerate all users
    Given I am authenticated as admin with password admin123
    When I GET /api/users
    Then the response status is 200
    And the response is a JSON array containing "alice", "bob", "admin"

  @security @vuln-006 @critical @regression
  Scenario: User cannot transfer funds from another user's account
    Given I am authenticated as alice with password alice123
    When I POST `{"fromId":2,"toId":1,"amount":50}` to /api/transfer
    Then the response status is 403
