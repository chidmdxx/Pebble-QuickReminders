# Pebble QuickReminders

Voice reminders for Pebble watches. Dictate in English, Spanish, or a mix of both, review the title and time, then press Select to add a Timeline pin with one alert.

Version **1.0.0** adds the bounded spoken clocks, explicit today periods, after-tomorrow dates, calendar-relative days/weeks, and reminder prompts described below.

Requires a microphone-equipped Pebble and an Android phone running the official Pebble companion with speech recognition enabled. One package supports Pebble Time, Time Steel, Time Round, Pebble 2, Time 2, Pebble 2 Duo, and Pebble Round 2. Original Pebble and Pebble Steel have no microphone and are not supported.

## Use

Open the app normally or through Quick Launch to start dictation immediately, with no menu or extra button press. Try:

- `Buy milk in 20 minutes`
- `Recuérdame comprar leche mañana a las 3 PM`
- `Tomorrow at 8 PM, remind me to buy bread`
- `Call Sam dentro de cinco minutos`
- `Recuérdame en media hora comprar leche`
- `Remind me in half an hour to buy milk`
- `Revisar la prueba mañana en la mañana`
- `En la mañana revisar la prueba`
- `Recuerda a las 8:00 poner a lavar`

Review the parsed date and time before confirming. Scroll to the bottom of long reminders to enable Select. Back from a draft discards it and starts dictation again; Back while recording exits.

When you name a day without a time, the default is 10 AM. With no day or time, the default is 8 PM today, or 10 AM tomorrow if 8 PM has passed. A clock without AM/PM, such as `at 8:30`, uses the next future AM or PM occurrence. Change the AM/PM defaults, ribbon color, and auto-close behavior in the companion's **Quick Reminders > Settings**.

`Recuerda a las 8:00 poner a lavar` keeps the title `poner a lavar` and uses today at 8 AM before 8 AM, or today at 8 PM at or after 8 AM but before 8 PM. At or after 8 PM it uses tomorrow at 8 AM.

Day periods use those defaults too: `mañana en la mañana` / `tomorrow morning` use AM, and `mañana por la noche` / `tomorrow evening` use PM. A leading period without a day, such as `En la mañana revisar la prueba`, uses the next future occurrence of that default time (today or tomorrow).

Explicit today periods stay today: `this morning` / `esta mañana` use the AM default; `this afternoon`, `this evening`, `tonight`, `esta tarde`, and `esta noche` use the PM default. They reject a default time that has passed, including the exact cutoff, rather than moving to tomorrow. They do not distinguish afternoon from evening. Use `today at 3 PM` / `hoy a las 3 PM` for a specific clock instead of combining a today-period phrase with another time.

`The day after tomorrow` / `pasado mañana` mean two phone-local calendar days ahead, with the AM default unless you give a clock. `In two days`, `en dos días`, `in a week`, and `dentro de una semana` instead keep the captured local clock time, including seconds, on the shifted date. Days and weeks follow the calendar through daylight-saving changes; minutes and hours remain elapsed durations. Nonexistent or repeated target wall times are rejected. Counts are whole numbers (written counts 1 through 99 or digits), still subject to the one-year scheduling horizon; compound and fractional durations remain unsupported.

Clocks also accept English hour/minute words such as `at eight thirty` and `at eight thirty five`, Spanish `a las ocho y media` / `a las ocho y cuarto`, English `at quarter past eight` / `at quarter to eight`, and Spanish `a las ocho menos cuarto`. These keep the same next-future AM/PM inference. `Quarter to twelve AM` means 11:45 PM before that midnight; an explicit named date anchors the midnight, so `tomorrow at quarter to twelve AM` is tonight at 11:45 PM. A bare numeric clock still needs a colon for minutes (`8:30`, not `8 30`). Spaced or punctuated meridiems such as `p. m.`, `p m`, and `a. m.` are recognized only as part of a clock; matching text in a title is preserved. Introduce a numbered title with `to` or a reminder prompt after a new spoken clock so it cannot be mistaken for an extra minute count.

Prompt wrappers are anchored to the beginning of the utterance or the title after a leading schedule: `don't forget to` (also a curly apostrophe), `avísame` / `avisame`, and `no olvides`, in addition to the existing prompts. Spanish prompts accept a whole-word `que` before the action; `Recuérdame comprar leche` and `Recuérdame que tengo una cita` are natural examples. The same words within a title are not removed. Courtesy prefixes `please` and `por favor` are not recognized as wrappers; they remain in the title, including any reminder words following them.

The parser supports a bounded set of phrases, not unrestricted natural language. Recurring reminders, competing schedules, invalid dates, and ambiguous daylight-saving times require another phrase. Titles are limited to 160 UTF-8 bytes.

`En media hora`, `in half an hour`, and `in half hour` mean exactly 30 minutes from dictation, whether they come before or after the title. Reviewing later does not move that time. Other fractional or compound intervals, such as `in 0.5 hours` or `en una y media horas`, remain unsupported.

**Check Timeline after saving.** A successful insertion request does not confirm delivery to the watch. Recovery keeps the same pin ID and time; it never retries automatically. Do not retry a pin you have removed from Timeline.

### Change one reminder's time from Timeline

Open a QuickReminders pin in Timeline and select **Change time**. This opens only that pin, not your latest reminder. There is no reminder picker, and this screen is not accessible from normal launch or the creation review.

Use Up/Down and Select to choose **In 5 minutes**, **In 10 minutes**, **In 30 minutes**, or **New time** to dictate a schedule. The menu omits the reminder heading and original-time subtitles; the full title and new time appear in the confirmation review. Selection uses the configured ribbon color on color watches, or black on monochrome watches. Change **Snooze preset 1** through **Snooze preset 3** in the companion settings to whole minutes from 1 through 10080. Existing settings without presets use fresh defaults of 5/10/30; a supplied invalid preset field must be corrected in Settings.

Speak only a supported schedule, such as `in half an hour`, `en media hora`, `dentro de cinco minutos`, `tomorrow at 8 PM`, `mañana a las tres PM`, `at eight thirty`, `esta noche`, `pasado mañana`, or `en dos días`. A named day alone uses the configured AM default; relative days/weeks keep the captured local clock time. An unscheduled phrase, an extra title, compound intervals, and invalid or ambiguous clock changes are rejected. The original title is preserved.

Each choice opens the full title/time review. Scroll long reminders to the bottom, then press Select to confirm. No pin is changed before confirmation. Relative times are measured once when the phone receives the choice, not when you later confirm. Confirmation replaces the **same pin ID** with one reminder at the chosen time. Back cancels an unsubmitted edit and exits; it never starts normal dictation. If a request is already in flight, Back exits without issuing another request; reopening that pin recovers any saved preview or uncertain insertion.

Uncertain insertions reopen for explicit, exact-payload retry; nothing replays automatically. A matched reload after confirmation also preserves the pending insertion, while a fresh action after a successful request offers the time menu again. An active edit for another pin is not silently replaced: open its original action to cancel or recover it first. Errors and timeouts reload only the selected pin, never the latest reminder.

This action requires a companion supporting local `openWatchApp` pin actions. Older pins do not acquire an action automatically; legacy recovery migrates locally without rewriting Timeline. Missing or expired lookup entries fail visibly. The reminder popup's built-in 10-minute Snooze is separate from this custom Timeline action.

After a successful insertion call, the phone prunes hidden lookup entries **more than two days past their scheduled time**. It keeps future reminders, active recovery/edit records, and uncertain API calls. Cleanup does not run just because you open the app and never deletes Timeline pins. Storage failures are visible; there is no count-based eviction.

## Upgrade compatibility

Version 0.4.0 introduced automatic migration of valid legacy reminder recovery data to the v2 storage format under the existing local-storage key. Versions before 0.4.0 cannot read that format, so downgrading to them after migration is not supported. Migration does not insert or rewrite Timeline pins; existing pins do not gain the **Change time** action automatically. Versions 0.4.1 through 1.0.0 keep the same storage format. Existing 0.4.0 and 0.4.1 pins retain their old action label until explicitly rescheduled; newly created or rescheduled pins use **Change time**.

## Build and install

Tests require Node.js 22 or later and GCC or Clang (`cc`, or set `CC` to the compiler executable). There are no npm dependencies. SDK builds use Pebble CLI 5.0.40 and SDK 4.33.1; follow the [SDK setup guide](https://developer.repebble.com/sdk.md). On Windows, use WSL for tests and builds.

From the repository root:

```text
npm test
cd app
pebble build
pebble install --emulator gabbro
```

The package is `app/build/app.pbw`. For a physical watch, enable the companion's Developer Connection and use `pebble install --phone PHONE_IP` on the same network, or `pebble install --cloudpebble` after signing in. See the [Developer Connection guide](https://developer.repebble.com/guides/tools-and-resources/developer-connection.md).

Run `pebble clean` before rebuilding after changing AppMessage keys in `app/package.json`. GitHub Actions runs the tests, builds all six supported SDK targets, and uploads the versioned PBW as `quickreminders-all-watches`.

**[Download CI builds](https://github.com/chidmdxx/Pebble-QuickReminders/actions/workflows/tests.yml?query=branch%3Amain+is%3Asuccess):** open the latest successful `main` run, then download **quickreminders-all-watches** under **Artifacts** and unzip the PBW. GitHub sign-in is required for Actions artifacts, even on a public repository; artifacts expire after 30 days. Use `main` builds rather than unreviewed pull-request artifacts.

## Project structure

| Path | Purpose |
| --- | --- |
| `app/src/c/main.c` | Watch dictation, confirmation UI, paging, and phone messaging. |
| `app/src/pkjs/parser.js` | English, Spanish, and mixed-language phrase parsing and date validation. |
| `app/src/pkjs/controller.js` | Draft, confirmation, cancellation, and recovery protocol. |
| `app/src/pkjs/lib/reminders.js` | Persistent recovery state and local Timeline pin insertion. |
| `app/src/pkjs/index.js` | PebbleKit JS events and queued watch replies. |
| `app/src/pkjs/settings.js`, `defaults.js` | Bundled settings page, preference storage, and validation. |
| `app/package.json`, `app/wscript` | Watch targets, message keys, resources, and SDK build. |
| `tests/` | Node tests and a native C harness running watch code against an SDK stub. |
| `store/` | App icons and synthetic emulator screenshots. |
| `.github/skills/` | Contributor workflows for [Pebble development](.github/skills/pebble-development/SKILL.md) and [phrase-pattern improvements](.github/skills/phrase-pattern-improvements/SKILL.md). |

The watch sends transcripts to the phone, which parses them locally. Only an explicit confirmation requests a pin. The phone keeps separate latest-reminder and Timeline-edit recovery plus a hidden per-pin lookup, not a user-facing reminder list. Creating another reminder does not remove earlier pins.

The authoritative local-storage key remains `quickreminders.pending.v1`; its migrated envelope is `{version:2, sequence, latest, edit, pins}`. Every new draft/open operation advances the bounded monotonic sequence (maximum 2147483646); cleanup never resets it. Records contain `{sequence, id, launchCode, state, value}`, with `sourceRevision` on edits. Submitted pin entries contain `{launchCode, id, value, revision, uncertain}`. `value` preserves `{title, instant, reference, zone}`. The entire envelope is validated and written atomically under one key.

The appended AppMessage keys are `LAUNCH_CODE` and `SNOOZE_1..3`. Only `APP_LAUNCH_TIMELINE_ACTION` enters the time route, using `launch_get_args()` as the positive launch code. Commands are `pin_open`, `pin_preset` (`TEXT` is zero-based `"0"`, `"1"`, or `"2"`), `pin_time` (`TEXT` is schedule-only speech), `pin_confirm`, `pin_retry`, and `pin_cancel`. Each request carries the exact `LAUNCH_CODE`, `TOKEN` and `REQUEST_ID`; replies echo command, request, and target. Initial opens use token 0; reloads retain the current token. Menu replies use `STATUS: "schedule"`; preview/confirmation use the existing `"draft"`/`"pending"` protocol. Tokens and source revisions fence stale requests, including old latest-reminder retries after a same-pin change.

## Privacy and limitations

The app has no server, runtime account login, or transcript logging. Reminder text and recovery state are stored in the companion's local storage and sent to the watch as pins. Pebble handles speech recognition; cloud recognition may send audio to the selected provider.

Automated tests cover parsing, settings, the phone protocol, and watch control flow. They do not prove speech recognition, screen layout, or Timeline delivery. Physical-device checks have covered the basic flow on Round 2, not every model or recovery case. Test changes with synthetic reminders and keep personal data out of issue reports.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and pull requests, and
[SECURITY.md](SECURITY.md) for private vulnerability reporting, maintainer access,
release policy, and the security checklist. Only the owner merges changes and
publishes releases; public visibility does not grant write access.

## License

[Apache 2.0](LICENSE). The pin-building code is adapted from [TomBolger/Billy](https://github.com/TomBolger/Billy); see [NOTICE](NOTICE) for attribution.
