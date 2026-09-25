import { defineConfig, devices } from '@playwright/test';

// Iridium's dev port 5173 is often occupied by other local projects, so the
// E2E suite runs the app on a dedicated port. Override with E2E_PORT if needed.
const PORT = Number(process.env.E2E_PORT ?? 7778);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
    globalSetup: './tests/global-setup.ts',
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // Every test signs up its own isolated user, so CI can run in parallel.
    workers: process.env.CI ? 2 : undefined,
    reporter: 'html',
    use: {
        baseURL: BASE_URL,
        navigationTimeout: 60000,
        trace: 'on-first-retry',
    },
    // Auth is explicit per test: the `authedPage` fixture creates a fresh,
    // isolated user on demand, while a plain `page` stays logged out. No global
    // storageState or setup project is needed; `globalSetup` only ensures the
    // named seed users (Alice, Bob) exist for the tests that log in as them.
    projects: [
        {
            name: 'chromium',
            testIgnore: '**/visual/**',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
        {
            name: 'firefox',
            testIgnore: '**/visual/**',
            use: {
                ...devices['Desktop Firefox'],
            },
        },
        {
            name: 'webkit',
            testIgnore: '**/visual/**',
            use: {
                ...devices['Desktop Safari'],
            },
        },
        // Visual inventory: a screenshot gallery of every major surface, only
        // included when explicitly requested (bun run test:visual) so the
        // default `playwright test` run is unaffected. Locale/timezone/scheme
        // are pinned so shots are stable across machines.
        ...(process.env.PW_VISUAL
            ? [
                  {
                      name: 'visual',
                      testMatch: 'visual/**/*.spec.ts',
                      use: {
                          ...devices['Desktop Chrome'],
                          locale: 'en-US',
                          timezoneId: 'UTC',
                          colorScheme: 'light' as const,
                          viewport: { width: 1280, height: 720 },
                          deviceScaleFactor: 1,
                      },
                  },
              ]
            : []),
    ],
    webServer: {
        command: `bun run dev --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        // The suite mocks /api/chat, so the real Anthropic key is never used —
        // env validation just needs a non-empty value for the server to boot.
        // BETTER_AUTH_BASE_URL must match the test port: it drives Better
        // Auth's trusted origins, so a mismatch rejects sign-in requests. The
        // browser auth client needs no URL; it calls its own origin.
        env: {
            ANTHROPIC_API_KEY:
                process.env.ANTHROPIC_API_KEY || 'sk-ant-e2e-dummy-key',
            BETTER_AUTH_BASE_URL: BASE_URL,
            // The suite creates a fresh user per test; the prod-tuned auth rate
            // limiter would otherwise reject the rapid sign-ups with 429s.
            DISABLE_AUTH_RATE_LIMIT: 'true',
            // Exposes /api/test-mailbox so specs can read password-reset links.
            E2E_TEST_HOOKS: 'true',
        },
    },
});
