# Pebble QuickReminders

Voice reminders for Pebble watches. Dictate in English, Spanish, or a mix of both, review the title and time, then press Select to add a Timeline pin with one alert.

Requires a microphone-equipped Pebble and an Android phone running the official Pebble companion with speech recognition enabled. One package supports Pebble Time, Time Steel, Time Round, Pebble 2, Time 2, Pebble 2 Duo, and Pebble Round 2. Original Pebble and Pebble Steel have no microphone and are not supported.

## Use

Open the app to start dictation. Try:

- `Buy milk in 20 minutes`
- `Recuérdame comprar leche mañana a las 3 PM`
- `Tomorrow at 8 PM, remind me to buy bread`
- `Call Sam dentro de cinco minutos`
- `Recuérdame en media hora comprar leche`
- `Remind me in half an hour to buy milk`
- `Revisar la prueba mañana en la mañana`
- `En la mañana revisar la prueba`

Review the parsed date and time before confirming. Scroll to the bottom of long reminders to enable Select. Back from a draft discards it and starts dictation again; Back while recording exits.

When you name a day without a time, the default is 10 AM. With no day or time, the default is 8 PM today, or 10 AM tomorrow if 8 PM has passed. A clock without AM/PM, such as `at 8:30`, uses the next future AM or PM occurrence. Change the AM/PM defaults, ribbon color, and auto-close behavior in the companion's **Quick Reminders > Settings**.

Day periods use those defaults too: `mañana en la mañana` / `tomorrow morning` use AM, and `mañana por la noche` / `tomorrow evening` use PM. A leading period without a day, such as `En la mañana revisar la prueba`, uses the next future occurrence of that default time (today or tomorrow).

The parser supports a bounded set of phrases, not unrestricted natural language. Recurring reminders, competing schedules, invalid dates, and ambiguous daylight-saving times require another phrase. Titles are limited to 160 UTF-8 bytes.

`En media hora`, `in half an hour`, and `in half hour` mean exactly 30 minutes from dictation, whether they come before or after the title. Reviewing later does not move that time. Other fractional or compound intervals, such as `in 0.5 hours` or `en una y media horas`, remain unsupported.

**Check Timeline after saving.** A successful insertion request does not confirm delivery to the watch. Recovery keeps the same pin ID and time; it never retries automatically. Do not retry a pin you have removed from Timeline.

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

**[Download CI builds](https://github.com/chidmdxx/Pebble-QuickReminders/actions/workflows/tests.yml?query=branch%3Amain+is%3Asuccess):** open the latest successful `main` run, then download **quickreminders-all-watches** under **Artifacts** and unzip the PBW. Repository access and GitHub sign-in are required; artifacts expire after 30 days. Use `main` builds rather than unreviewed pull-request artifacts.

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

The watch sends transcripts to the phone, which parses them locally. Only an explicit confirmation requests a pin. The app keeps one recovery record, not a reminder list; creating another reminder does not remove earlier pins.

## Privacy and limitations

The app has no server, runtime account login, or transcript logging. Reminder text and recovery state are stored in the companion's local storage and sent to the watch as pins. Pebble handles speech recognition; cloud recognition may send audio to the selected provider.

Automated tests cover parsing, settings, the phone protocol, and watch control flow. They do not prove speech recognition, screen layout, or Timeline delivery. Physical-device checks have covered the basic flow on Round 2, not every model or recovery case. Test changes with synthetic reminders and keep personal data out of issue reports.

## License

[Apache 2.0](LICENSE). The pin-building code is adapted from [TomBolger/Billy](https://github.com/TomBolger/Billy); see [NOTICE](NOTICE) for attribution.
