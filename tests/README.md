# Tests

```bash
npm test
```

No framework, no dependencies. Plain Node scripts using `node:assert`, run under
`node --experimental-strip-types` so they can import the project's `.ts` files
directly. That works because every module they touch has only type-only imports
of app types — nothing needs a bundler, a JSX transform or a running app.

## Why these exist

Every check here corresponds to a bug that reached production, or to a
guarantee that broke once and must not break again. They were written while
diagnosing real failures reported from a phone, not added afterwards for
coverage.

| File | Guards |
|---|---|
| `events.test.mjs` | `src/lib/events.ts` — the single write choke point for `calendar_events`. Insert payloads stay byte-identical to the pre-extraction code; a failed Google push never rolls back or hides the local write; delete reads `external_id` before the row goes; database refusals stay fatal while network failures are reported as ambiguous; a wall-clock time survives whatever timezone designator the model appends. |
| `google.test.mjs` | The Google Calendar payload conversion. All-day dates across six timezones, Google's exclusive all-day `end.date`, year-roll and leap-day boundaries, and the echo filter that stops the pull re-importing what the push just sent. |
| `datetime.test.mjs` | `src/lib/datetime-local.ts`. Opening an edit dialog and saving without changing anything must not move the time — checked across five zones, every hour of the day, both US DST transitions and the year boundary. |
| `drift-scan.test.mjs` | `scripts/lib/drift-scan.mjs`, the triage for rows the dialog bug moved before it was fixed. The all-day invariant (every correct path writes local midnight, so any other local time is proof of a move), edit history as a filter rather than a verdict, and the ranking that puts a mis-timed publish above a mis-shown event. Reads instants in a **named** zone, never the runner's. |

## Run them in a non-UTC timezone

**This is the important part.** Several of these bugs are invisible at UTC+0,
because `iso.slice(0, 16)` on a UTC timestamp is accidentally correct there.
CI and most dev containers run in UTC, which is exactly why the bugs survived.

```bash
TZ=America/New_York npm test
TZ=Asia/Singapore   npm test
TZ=Pacific/Auckland npm test   # UTC+12: local midnight is noon the previous day in UTC
```

`datetime.test.mjs` reports which branch it took, so a UTC-only run says so
rather than silently proving less than it appears to.
