Feature: VULN-001 - Insecure deserialization is removed
  Background:
    Given the Spring Boot app is running on "http://localhost:8080"
    And HTTP Basic credentials for alice are available

  @security @vuln-001 @critical @regression
  Scenario: Valid JSON payload is parsed as a Map
    When I POST `{"name":"alice","amount":100}` to /api/deserialize with Content-Type application/json as alice
    Then the response status is 200
    And the response body contains "Map<String,Object>"
    And the response body contains "size":2

  @security @vuln-001 @critical @regression
  Scenario: Base64 gadget chain no longer executes native deserialization
    When I POST `rO0ABXNyABNqYXZhLnV0aWwuQXJyYXlMaXN0...` to /api/deserialize with Content-Type application/json as alice
    Then the response status is not 200 with an instantiated Java class
    And the response body does not contain "Deserialized:"
    And the response body does not match `Deserialized:\s+[a-zA-Z0-9_.$]+`
    And the server does not instantiate any java.* class from the request
