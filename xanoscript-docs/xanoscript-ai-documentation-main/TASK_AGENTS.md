---
applyTo: "tasks/*.xs"
---

# Xanoscript Custom Tasks Guide

This document serves as comprehensive instructions for generating custom tasks in Xanoscript. As an AI agent (e.g., copilot), use these guidelines to create robust, scheduled automation jobs based on user requests. Emphasize reliability, idempotency, and monitoring. Capture language subtleties: stacks execute sequentially (no branching unless conditional/foreach); schedules use UTC timestamps with freq in seconds (no cron); history enables audit trails; transactions ensure atomicity; env vars for secrets. Reference examples and syntax from supporting docs.

## Core Principles

- **Automation Rigidity**: Tasks are fire-and-forget; no inputs/outputs—use env vars for config.
- **Execution Flow**: Stack is linear; foreach/while for iteration; conditional for branches; try_catch for resilience.
- **Scheduling Subtleties**: `events` array supports multiples (e.g., daily + weekly); `starts_on` UTC ISO (YYYY-MM-DD HH:MM:SS+0000); `freq` multiples of 3600 (hourly+); `ends_on` optional cutoff; no overlaps—system dedupes.
- **Logging/Monitoring**: `debug.log` to stdout (structured JSON if object); `history = "inherit"` logs runs to DB (table: task_history).
- **Error Handling**: No global try_catch—wrap risky ops (API/DB); failures retry per policy (not defined here).
- **Idempotency**: Use timestamps/unique checks; transactions for multi-ops.
- **Extensibility**: Call functions (`function.run`); API/DB helpers inherit auth.

## Task Structure

Every custom task follows this template, highlighting subtleties:

```xs
task <task_name> {
  description = "<Purpose; logic summary; schedule hint; optional>"

  stack {
    var $<var_name> {
      value = <expr: now|math.*|db.*>
      description = "<Purpose; required for traces>"
    }

    db.query <table> {
      where = <bool expr: $db.<table>.<field> == val && ...>
      [output = ["field1", "field2"]]
      description = "<Purpose>"
    } as $<result>

    foreach ($array) {
      each as $<item> {
        db.edit/del/add <table> { ... }
      }
    }


    conditional {
      if (<bool>) {

      } elseif (<bool>) {

      } else {

      }
    }


    try_catch {
      try {
        api.request { ... }
      }
      catch {
        debug.log { value = "Err: " ~ $error.message }
      }
    }

    debug.log {
      value = <str|obj: {key: val}>
      description = "<Context>"
    }
  }

  schedule = [
    {starts_on: <YYYY-MM-DD HH:MM:SS+0000>, freq: <secs: 86400 daily>, [ends_on: <cutoff>]}
  ]

  [history = "inherit"]
}
```

- **Name**: Kebab-case (e.g., `monthly-user-cleanup`); stored in `tasks/<name>.xs`.
- **Helpers Subtleties**: `db.*` uses table auth; `api.request` needs full URL/params/headers; `math.add` mutates var; `now|transform_timestamp:<rel>:"tz"` for dates.
- **No Params**: Hardcode or `$env.<key>` (e.g., API keys).
- **Transactions**: `db.transaction { stack { ... } }`—rolls back on fail.

## Step-by-Step Creation Process

1. **Analyze Request**: Identify job (e.g., "Weekly stock alert"). Note tables/queries, actions (edit/add/del/API), conditions, freq (daily=86400s).
2. **Build Stack**:
   - Init vars (timestamps, counters).
   - Query data (`search` as SQL WHERE).
   - Loop/process (foreach; avoid >10k items—paginate).
   - Actions (DB/API); wrap in try_catch/transactions.
   - Log start/counts/end (use objects for metrics).
3. **Set Schedule**: Future `starts_on` (e.g., next Monday); single event unless mixed freq.
4. **Add History**: `{inherit: true}` for audits.
5. **Validate Subtleties**: No infinite loops (while needs break); idempotent (e.g., check exists before add); UTC for all times.
6. **Review**: Simulate flow; ensure logs cover branches/fails.

## Common Patterns

- **Cleanup**: Query expired (`where = $db.table_name.expires_at < now`); foreach del; count/log.
- **Reports**: Query period (`>= transform_timestamp:"7 days ago"`); sum/agg; db.add in transaction.
- **Notifications**: Query due (`end_date <= now + 604800000`); foreach API/email; log sends.
- **Alerts**: Conditional on count>0; api.realtime_event for websockets.
- **AI/External**: try_catch function.run; fallback vars.
- **Pagination**: While has_next { db.query ... after: $cursor } for large sets.
- **Math/Date**: `$now - (7*86400*1000)` for ms offsets.

## Best Practices

- **Naming**: Action-oriented, freq-hinted (e.g., `hourly-cache-purge`).
- **Documentation**: `description` on task/stack/blocks for traces.
- **Performance**: Limit queries (<1M rows); batch DB ops; no deep nests.
- **Security**: `$env` for creds; auth-aware DB.
- **Resilience**: try_catch everywhere external; log errors with context (`$error.message`).
- **Length**: <100 lines; extract to functions.
- **Scheduling**: Freq aligns with load (off-peak); ends_on for temp tasks.
- **Subtleties**: No parallelism (sequential); history auto-prunes old.

## References

- [Full examples](../docs/task_examples.md)
- [Syntax details](../docs/task_guideline.md)
- [Core blocks](../docs/functions.md)
