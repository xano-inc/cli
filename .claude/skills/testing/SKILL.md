# XanoScript Functions Testing

Guide for running and managing the XanoScript function test suite.

## Overview

The testing system validates XanoScript functions by executing live API tests against `xs-*` API groups in Xano. Test definitions are stored in Xano tables and can be run via CLI or dashboard.

## Quick Commands

```bash
# Run all tests
npm run test:skills

# Run tests for a specific function
npm run test:skills -- --function array.find

# Run tests for a category
npm run test:skills -- --category db

# Import/refresh test definitions from Xano
npm run test:skills:import

# Run with verbose output
npm run test:skills -- --verbose

# Export results to JSON
npm run test:skills -- --export json > results.json
```

## Environment Variables Required

```bash
MCP_SYSTEM_API_URL="https://your-instance.xano.io/api:mcp_system_canonical"
XANO_BASE_URL="https://your-instance.xano.io"
XANO_API_TOKEN="your_xano_api_token"
XANO_WORKSPACE_ID="40"
```

## Database Tables

### skill_function
Master registry of XanoScript functions.

| Column | Type | Description |
|--------|------|-------------|
| id | int | Auto-generated |
| name | text | Function name (e.g., "array.find") |
| category | text | Category (e.g., "array", "db") |
| skill_folder | text | Folder name (e.g., "array-find") |
| api_group_id | int | Xano API group ID |
| api_group_name | text | Group name (e.g., "xs-array-find") |
| base_url | text | Full API base URL |
| status | enum | pending, documented, tested, validated |
| test_count | int | Number of tests |
| passed_count | int | Tests passed |
| failed_count | int | Tests failed |
| last_tested_at | timestamp | Last test run time |

### skill_test
Individual test cases for each function.

| Column | Type | Description |
|--------|------|-------------|
| id | int | Auto-generated |
| function_id | int | FK to skill_function |
| endpoint_id | int | Xano endpoint ID |
| endpoint_name | text | Endpoint name (e.g., "find-basic") |
| endpoint_path | text | API path (e.g., "/find-basic") |
| http_method | text | GET, POST, PATCH, DELETE |
| description | text | Test purpose |
| input_payload | json | Request body |
| expected_response | json | Expected output |
| expected_status | int | Expected HTTP status (default 200) |
| actual_response | json | Last actual result |
| actual_status | int | Last actual HTTP status |
| status | enum | pending, passed, failed, error |
| error_message | text | Error details if failed |
| duration_ms | int | Test execution time |
| last_run_at | timestamp | Last test execution |

### skill_test_run
Test execution history.

| Column | Type | Description |
|--------|------|-------------|
| id | int | Auto-generated |
| function_id | int | Null for full suite |
| run_type | enum | single, function, category, full |
| total_tests | int | Tests executed |
| passed | int | Tests passed |
| failed | int | Tests failed |
| errored | int | Tests with errors |
| duration_ms | int | Total execution time |
| triggered_by | text | cli, dashboard |

## Response Matchers

Tests support special matchers for dynamic values:

| Matcher | Matches |
|---------|---------|
| `{{any}}` | Any value |
| `{{uuid}}` | Valid UUID format |
| `{{timestamp}}` | Number or ISO date string |
| `{{number}}` | Any number |
| `{{string}}` | Any string |
| `{{array}}` | Any array |
| `{{object}}` | Any object (not array) |
| `{{regex:pattern}}` | Custom regex pattern |

### Example Expected Response with Matchers

```json
{
  "id": "{{uuid}}",
  "name": "John",
  "created_at": "{{timestamp}}",
  "data": "{{any}}"
}
```

## Dashboard Integration

The MCP System Dashboard includes a "Skill Tests" tab with:

1. **Stats Overview**: Functions, Total Tests, Passed, Failed, Pending
2. **Category Filter**: Filter by function category
3. **Function Cards**: Visual grid with pass rates and progress bars
4. **Function Detail Modal**: View individual test results
5. **Run Tests**: Execute tests from the dashboard
6. **Export**: Download test data as JSON

Access the dashboard at: `dashboard/index.html`

## Creating New Test Groups

When documenting a new XanoScript function:

1. **Create API Group** in Xano with `xs-` prefix:
   ```
   xs-{category}-{function}
   ```
   Example: `xs-array-find`, `xs-db-query`

2. **Create Test Endpoints** within the group:
   - Each endpoint tests a specific pattern
   - Name endpoints descriptively: `find-basic`, `find-with-callback`

3. **Document in SKILL.md**:
   - Create folder: `.claude/skills/functions/{category}-{function}/`
   - Include API Group info, endpoint table, expected responses

4. **Run Import** to populate test database:
   ```bash
   npm run test:skills:import
   ```

## Test Execution Flow

1. **Load Tests**: Fetch from `skill_test` table
2. **Execute**: Make HTTP requests to each endpoint
3. **Compare**: Check actual vs expected response
4. **Report**: Display results with pass/fail status
5. **Save**: Update test records with results

## CLI Options

| Option | Short | Description |
|--------|-------|-------------|
| `--function <name>` | `-f` | Test specific function |
| `--category <name>` | `-c` | Test by category |
| `--verbose` | `-v` | Detailed output |
| `--parallel <n>` | `-p` | Max parallel requests (default: 3) |
| `--export <format>` | `-e` | Export format (json, markdown, html) |
| `--import` | | Import from Xano/SKILL.md |
| `--help` | `-h` | Show help |

## Troubleshooting

### Tests not running
- Check environment variables are set
- Verify MCP System API URL is correct
- Run `npm run test:skills:import` to refresh

### Import fails
- Verify XANO_API_TOKEN is valid
- Check XANO_BASE_URL doesn't include `/api:...`
- Ensure xs-* API groups exist in Xano

### Tests failing unexpectedly
- Check endpoint is actually deployed
- Verify expected response matches current behavior
- Look for timeout issues (increase with `--timeout`)

## Source Files

```
src/testing/
  types.ts           # TypeScript interfaces
  skill-parser.ts    # SKILL.md parser
  skill-runner.ts    # Test execution engine
  skill-cli.ts       # CLI entry point
  xano-discovery.ts  # Xano API group discovery
```

## Related Skills

- [effective-intents](../effective-intents/SKILL.md) - Writing MCP intents
- [sql-lambda-patterns](../sql-lambda-patterns/SKILL.md) - XanoScript development
- [task-management](../task-management/SKILL.md) - Task tracking
