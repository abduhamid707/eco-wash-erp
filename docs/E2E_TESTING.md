# ECO WASH E2E testing

Requires started Docker beta stack at http://localhost:8080 and a fresh testing database. Never use production credentials or production data.

```bash
pnpm install
pnpm exec playwright install chromium
pnpm test:e2e
```

For authenticated journeys provide a dedicated testing user:

```bash
E2E_LOGIN='test-user' E2E_PASSWORD='a-test-only-secret' pnpm test:e2e
```

Tests run desktop and mobile Chromium. The unauthenticated tests can run without credentials. Authenticated tests are intentionally skipped until env credentials are provided.

Do not use financial write operations on a real business database. A separate isolated test fixture database and full write-flow E2E suite remain release requirements. Reconciliation and idempotency are also covered by API integration smoke tests.
