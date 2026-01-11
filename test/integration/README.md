# Integration Tests

These tests run against a real Xano instance to verify the CLI commands work correctly.

## Prerequisites

1. Set up a profile with valid Xano credentials:

```bash
xano profile create integration \
  -i https://YOUR-INSTANCE.xano.io \
  -t YOUR_ACCESS_TOKEN \
  -w 40
```

Or use the wizard:

```bash
xano profile wizard
```

2. Set the profile as default or specify it via environment variable:

```bash
# Option A: Set as default
xano profile set-default integration

# Option B: Use environment variable
export XANO_TEST_PROFILE=integration
```

## Running Integration Tests

```bash
# Run integration tests
npm run test:integration

# Run with specific profile
XANO_TEST_PROFILE=myprofile npm run test:integration
```

## What the Tests Do

The integration tests run in phases:

1. **Create Resources** - Creates test tables, API groups, and API endpoints
2. **List Resources** - Verifies created resources appear in list results
3. **Get Resources** - Retrieves individual resources and verifies details
4. **Edit Resources** - Updates resource descriptions
5. **Delete Resources** - Cleans up all created test resources
6. **Verify Deletion** - Confirms resources are no longer in list results

All created resources use a unique timestamp suffix to avoid conflicts.

## Test Commands

```bash
# Run only unit tests (mocked)
npm test

# Run only integration tests (real API)
npm run test:integration

# Run all tests
npm run test:all
```
