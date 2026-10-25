import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './tests/e2e',
 retries: process.env.CI ? 1 : 0,
 workers: process.env.CI ? 1 : undefined,
 timeout: 30000,
 use: { baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080', trace:'retain-on-failure', screenshot:'only-on-failure' },
 projects: [{name:'chromium',use:{...devices['Desktop Chrome']}},{name:'mobile-chrome',use:{...devices['Pixel 7']}}],
 reporter: [['list'],['html',{open:'never'}]]
});
