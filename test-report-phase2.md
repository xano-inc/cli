# Phase 2 Integration Test Report

## Summary

| Metric | Value |
|--------|-------|
| **Run Date** | 2026-01-11T09:46:44.720Z |
| **Total Duration** | 5.52s |
| **Profile** | mcp-server |
| **Workspace** | 40 |
| **Total Tests** | 7 |
| **Passed** | 2 |
| **Failed** | 0 |
| **Skipped** | 5 |

## Results

| Status | Test | Duration |
|--------|------|----------|
| PASS | Addon Commands > List Addons > lists addons in JSON format | 98ms |
| PASS | Addon Commands > List Addons > lists addons in summary format | 98ms |
| SKIP | Addon Commands > Get Addon > gets addon details in JSON format | 1ms |
| SKIP | Addon Commands > Get Addon > gets addon in summary format | 0ms |
| SKIP | Addon Commands > Edit Addon > edits addon with XanoScript | 0ms |
| SKIP | Addon Commands > Addon Security > clears addon security | 0ms |
| SKIP | Addon Commands > Delete Addon > deletes the test addon | 0ms |

---

## Detailed Results

### Addon Commands

#### List Addons

##### PASS lists addons in JSON format

- **Status:** passed
- **Duration:** 98ms
- **Command:** `xano addon list -p mcp-server -w 40 -o json`
- **Output:**
```json
[]
```

##### PASS lists addons in summary format

- **Status:** passed
- **Duration:** 98ms
- **Command:** `xano addon list -p mcp-server -w 40`
- **Output:**
```json
No addons found
```

#### Get Addon

##### SKIP gets addon details in JSON format

- **Status:** skipped
- **Duration:** 1ms

##### SKIP gets addon in summary format

- **Status:** skipped
- **Duration:** 0ms

#### Edit Addon

##### SKIP edits addon with XanoScript

- **Status:** skipped
- **Duration:** 0ms

#### Addon Security

##### SKIP clears addon security

- **Status:** skipped
- **Duration:** 0ms

#### Delete Addon

##### SKIP deletes the test addon

- **Status:** skipped
- **Duration:** 0ms

