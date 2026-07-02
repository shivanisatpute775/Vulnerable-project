package com.owasp.lab.bdd.config;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

/**
 * Tiny loader for the {@code playwright.config.properties} file at the
 * classpath root.  Values fall back to sensible localhost defaults so that
 * a fresh checkout still works without the property file present.
 */
public final class PlaywrightConfig {

    public static final String BASE_URL;
    public static final String API_BASE_URL;
    public static final String BROWSER;
    public static final boolean HEADLESS;
    public static final double TIMEOUT_MS;
    public static final double EXPECT_TIMEOUT_MS;
    public static final String LOCALE;
    public static final String TIMEZONE;

    static {
        Properties p = new Properties();
        try (InputStream in = PlaywrightConfig.class.getClassLoader()
                .getResourceAsStream("playwright.config.properties")) {
            if (in != null) {
                p.load(in);
            }
        } catch (IOException e) {
            // fall through to defaults below
        }
        BASE_URL = p.getProperty("baseUrl", "http://localhost:8080");
        API_BASE_URL = p.getProperty("apiBaseUrl", BASE_URL + "/api");
        BROWSER = p.getProperty("browser", "chromium");
        HEADLESS = Boolean.parseBoolean(p.getProperty("headless", "true"));
        TIMEOUT_MS = Double.parseDouble(p.getProperty("timeoutMs", "30000"));
        EXPECT_TIMEOUT_MS = Double.parseDouble(p.getProperty("expectTimeoutMs", "5000"));
        LOCALE = p.getProperty("locale", "en-US");
        TIMEZONE = p.getProperty("timezone", "UTC");
    }

    private PlaywrightConfig() { /* static config holder */ }
}