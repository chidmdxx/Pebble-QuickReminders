---
name: phrase-pattern-improvements
description: Extend or fix QuickReminders English, Spanish, and mixed-language reminder phrase parsing with regression-first parser and phone tests. Use for phrase-pattern improvements, dictation grammar, incorrect extracted titles or scheduled times, and ambiguous phrases that accidentally become default reminders.
compatibility: Node.js 22 or later; npm; a GCC/Clang-compatible host C compiler for the full test suite.
---

# Phrase-pattern improvements

Keep the grammar bounded and the reviewed reminder predictable. Understand the phrase, reproduce the problem, then change the smallest parsing rule that solves it.

## Read the local contract

- `app\src\pkjs\parser.js`: `parse`, `clock`, `competingSchedule`, `invalidScheduleBoundary`, `resolveWall`, `draft`, and `validate`. Match the existing Pebble-compatible JavaScript style; do not add an NLP service or dependency.
- `app\src\pkjs\defaults.js`: initial AM `10:00`, PM `20:00`; `parse(text, reference, settings)` validates the whole settings object.
- `tests\parser.test.js`: `node:test`, strict assertions, table-driven phrase/title/instant cases, and `zone(name, run)` restoring `process.env.TZ` in `finally`.
- `tests\phone.test.js`: the VM-backed `phone(customController, clock)` fixture exercises the real phone entrypoint, queued deliveries, confirmation, and pin capture.
- `package.json` and `tests\watch.test.js`: `npm test` runs all Node tests, including native watch tests using `process.env.CC || 'cc'`.

Re-read the relevant rules and nearby tests rather than assuming a reported phrase is unsupported.

## Pin down the regression

1. Write down the requested grammar and its limits. Separate schedule text from title text, including accents, case, punctuation, and introduced titles such as `AM radio` or `PM review`. Use synthetic phrases, not private dictation.
2. Fix the reference clock and phone timezone. Start with `Date.UTC(2026, 9, 14, 12)` and `zone('UTC', ...)` unless the report needs another clock. Dates use zero-based months. Pass the reference into `parse`; never rely on today's date or the machine timezone.
3. Add parser tests **before** changing grammar. For each positive case assert the exact `title`, numeric `instant` (prefer an independently calculated `Date.UTC(...)`), and captured `reference`. For example, `Recuérdame revisar Café en veinte minutes` must yield `revisar Café` and `Date.UTC(2026, 9, 14, 12, 20)` at that reference.
4. Add rejected near-misses and adjacent valid phrases. Pick English, Spanish, and mixed variants relevant to the rule; cover missing titles, malformed counts/clocks, competing schedules, or recurrence when that boundary is affected. For relative-unit changes, include zero, decimal, and compound intervals with both digits and words, such as `in five mins 30 seconds`. Assert rejection, not a fallback schedule. Preserve nearby existing grammar; do not turn every conceivable language combination into a new test matrix.
5. Run the smallest selected test and record the expected failure. If it already passes, report that fact and add only missing regression coverage; do not manufacture a parser change.

## Change and exercise the boundary

Make a surgical change to the relevant matcher or helper. Preserve original title text and the one-schedule rule. Unsupported time-like text must not silently become an AM/PM default reminder.

Search all test fixtures for the syntax being changed. A newly supported phrase may already be an intentional rejection case. Convert that fixture to a positive assertion and retain a genuinely unsupported near-miss; do not delete the rejection coverage wholesale.

Choose interaction tests based on the change:

- **Defaults:** named days without a clock use configured AM; no schedule uses PM today before its cutoff, otherwise AM tomorrow. Leading day-period phrases use the relevant AM/PM setting. Try custom values such as `{ amTime: '09:15', pmTime: '18:45', ribbonColor: 224, autoClose: true }` when touching these paths.
- **Clock inference:** unmarked hours `1..12` consider AM/PM; explicit meridiem, `12 AM`/`12 PM`, past times, and AM/PM words in titles must retain their current meaning.
- **Wall dates:** use phone-local calendar arithmetic, not an elapsed 24 hours. When changing absolute/default date resolution, include a non-UTC case and relevant DST checks. In `America/New_York`, tomorrow at `2:30 AM` from `Date.UTC(2027, 2, 13, 12)` is a gap; tomorrow at `1:30 AM` from `Date.UTC(2026, 9, 31, 12)` occurs twice. Both must reject, not normalize or choose an occurrence.
- **Timezone boundaries:** schedule qualifiers such as UTC or offsets remain unsupported unless explicitly requested; ordinary timezone words inside introduced titles remain title text. After a timezone change, assert `CAN_CONFIRM` is `0` for the unsubmitted draft and an attempted confirmation inserts no pin.
- **Relative time:** keep the captured reference and instant through delayed review; do not recompute from the confirmation clock. Preserve current count, title-byte, and future-horizon bounds unless explicitly changing them.

Add phone regression coverage for the changed phrase and a rejected near-miss. Inject the fixed clock and restore any timezone changes. Assert `STATUS: 'draft'`, exact `TITLE`, local `WHEN`, `CAN_CONFIRM`, and `SECONDS_UNTIL`; **no pin before explicit confirmation**, including reload and cancellation/error paths under test. Flush queued delivery with `.success()` as the fixture does. Confirm using the returned `TOKEN`; assert exactly one pin with the expected ISO instant, title, and one reminder at the same instant. Repeated confirmation must not duplicate it. Rejected phrases must not insert a pin, even if confirmation is attempted.

Keep transcript and private payload logging out of application code. Assert `logs` stays empty on success and that errors/retries never expose phrase text or raw platform details.

## Validate and report

Run from the repository root, with Node CLI options before file paths:

```powershell
node --test --test-name-pattern="distinctive regression test name" tests\parser.test.js
node --test tests\parser.test.js tests\phone.test.js
npm test
```

Use the first command for the red/green loop; then run the affected parser/phone files and the full suite. `npm test` needs a GCC/Clang-compatible host compiler for the C watch harness, not a Pebble SDK. If `cc` is unavailable, select an installed compatible compiler with `$env:CC = 'gcc'` or `$env:CC = 'clang'` before `npm test`. Report missing tooling or failures accurately; do not claim the full suite passed based on parser tests alone.

Update directly affected phrase examples in existing project documentation when behavior changes. Report supported phrases, exact expected results, rejected boundaries, changed files, and commands/results.

For a **plan-only/dry-run** request, inspect and return proposed tests, expected results, likely source changes, and validation commands only. Do not modify grammar, tests, or docs, or execute the plan. `evals\evals.json` contains dry-run prompts; saving them does not mean they were executed.

Stay local. Do not read credentials/secrets, add transcript logging, log in, deploy, call external services, rewrite history, force-push, or perform destructive cleanup. Do not commit or push unless separately requested.
