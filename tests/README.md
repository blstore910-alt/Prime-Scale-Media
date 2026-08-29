# Tests

These tests run with Node's built-in test runner (`node --test`) — no
extra dependency.

Run them:

```bash
npm run test
```

Under the hood: `node --test --experimental-strip-types 'tests/**/*.test.ts'`.

We start with the pure-function library helpers (search sanitisation,
error scrubbing, rate-limit shape) because they're deterministic and
easy to lock down. The server actions and RPCs need a real Supabase
instance and are covered by the manual `docs/TEST_PLAN.md`.
