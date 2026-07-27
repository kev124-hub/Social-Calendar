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
| `zoned-time.test.mjs` | `src/lib/zoned-time.ts`, the per-event timezone render helper. The property no other test asserts: **the same row must read as the same wall clock under every device zone** — checked by re-running under five of them. Also the offset marker (computed from the event's own date, so a New York event reads GMT-5 in January and GMT-4 in July), that the marker appears only when it differs from the device, that a null zone still renders exactly as today, and 1054 comparisons proving the output is byte-identical to date-fns whenever the event's zone *is* the device's. |
| `calendar-utils.test.mjs` | `eventCoversDay` — which day a row is filed under, the dangerous half of the timezone work: a wrong zone here does not mislabel an event, it moves it to another date. A 00:30 Monaco event covers 29 July under all five device zones, spans keep their length with no bleed either side, and an unzoned row still follows the device — the same instant landing on two different days across those zones, which is exactly the behaviour a zone removes. |
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

`zoned-time.test.mjs` does not depend on the runner's zone for its central
claims: it re-executes itself as a child process under five different `TZ`
values and compares the readings. So the "same wall clock everywhere" property
is proved even on a UTC-only CI run — but the *other* files still need a non-UTC
run, so keep doing it.

## Importing project modules

These files import `.ts` sources directly under `--experimental-strip-types`,
which is plain Node with no bundler — so a module they touch may only use
type-only `@/` imports, since nothing maps that alias at runtime. Where one
source file genuinely needs another at runtime (`events.ts` → `zoned-time.ts`),
it imports it relatively **with the extension** (`./zoned-time.ts`), which is
the specifier Node resolves and tsc accepts via `allowImportingTsExtensions`.
An extensionless relative import typechecks and then fails to load here.
