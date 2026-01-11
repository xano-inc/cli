# Addon Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T11:05:49.112Z |
| **Total Duration** | 11.08s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 3 |
| **Passed** | 3 |
| **Failed** | 0 |
| **Skipped** | 0 |

## Test Approach

Addons always extend a specific existing table. This test suite:

1. **Creates a test table** (required dependency)
2. **Creates an addon** that extends the table
3. **Tests full lifecycle** - list, get, edit, security, delete
4. **Cleans up** - deletes addon first, then table

## Dependency Chain

```
Table (created first)
  └── Addon (extends the table)
        └── Can be used by Functions/APIs
```

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Phase 6: Error Handling > Invalid Operations > handles get with non-existent addon ID | 10.15s |
| PASS | Phase 6: Error Handling > Invalid Operations > handles create with invalid XanoScript | 395ms |
| PASS | Phase 6: Error Handling > Invalid Operations > handles create with missing file | 40ms |

---

## Detailed Results

### Phase 6: Error Handling

#### Invalid Operations

##### PASS handles get with non-existent addon ID

- **Status:** passed
- **Duration:** 10.15s
- **Command:** `xano addon get 999999999 -p mcp-server -w 40 -o json`
- **Error:**
```
API request failed with status 404: Not Found
{"code":"ERROR_CODE_NOT_FOUND","message":""}
```

##### PASS handles create with invalid XanoScript

- **Status:** passed
- **Duration:** 395ms
- **Command:** `xano addon create -p mcp-server -w 40 -f /var/folders/0n/jvfbdf6123v9_w9sdnvq8jy40000gn/T/test-addon-invalid-1768129548675.xs -o json`
- **Error:**
```
API request failed with status 400: Bad Request
{"code":"ERROR_CODE_SYNTAX_ERROR","message":"Syntax error: unexpected \u0027invalid\u0027","payload":{"char":0,"line":0,"col":0,"error_line":"invalid xanoscript content {{{","error_snippet":"invalid xanoscript content {{{"}}
```

##### PASS handles create with missing file

- **Status:** passed
- **Duration:** 40ms
- **Command:** `xano addon create -p mcp-server -w 40 -f /nonexistent/path.xs -o json`
- **Error:**
```
File not found: /nonexistent/path.xs
```

## Created Resources

| Resource Type | ID | Name |
|---------------|----|----- |
