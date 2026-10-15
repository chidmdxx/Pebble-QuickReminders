# Pebble QuickReminders

Private, timeline-only voice reminders for Pebble Round 2 (`gabbro`) and an Android phone running the official Pebble companion.

**Development build; basic physical-device flow confirmed.** The user confirmed one Timeline pin and exactly one timely alert after returning to the watch face and disconnecting Bluetooth, and separately reported a mixed English/Spanish reminder working. With the native-action-bar and relative-time revision, the user also confirmed automatic return to the watch face, one pin and one timely alert with the app closed. A subsequent cosmetic update removed redundant draft instructions and added an original app-drawer icon; it was installed on the real watch. Those device observations predate the default-time and topic-continuation changes below and do not establish all speech models, recovery paths or timing conditions. Do not rely on this build for important reminders yet.

## What this version does

1. Open the app: Pebble's native microphone starts immediately, including when a previous insertion is saved. If transcription finishes before phone JS is ready, the app retains it until readiness is acknowledged. Dictation itself never replays or inserts a pin. **Back while recording exits the app**, leaving any saved record unchanged.
2. The phone interprets a supported English, Spanish or mixed-language phrase using its local clock and timezone. There is no separate native transcript-approval screen.
3. The parsed draft opens directly, with Pebble's native right-hand action bar. Check the complete title, local date/time and relative estimate, such as **In 2h 20m**, then press **Select** (check mark) to request one timeline pin with one alert. Up/Down pages through long text; a long draft must be read to the bottom first. Text follows the round screen's contour through the full available height beside the action bar, rather than a fixed rectangular inset. The final page stays aligned so its last line is not forced against the circular rim. A short draft needs no extra review/menu step. The date/time uses the phone's timezone, but the card does not display a timezone line.
4. Once the phone returns a matching, error-free insertion response, the app closes to the watch face by default. With **Auto-close after saving** disabled, it stays on a saved notice: Select records another reminder; Back exits. **Check Timeline**: this response is not a delivery acknowledgement. Errors, lost replies and timeouts keep the app open with recovery guidance.
5. **Back on an unsubmitted confirmation declines that draft and records again**, after the phone acknowledges cancellation. Change a title or time by dictating a corrected reminder. Holding Select does nothing and cannot confirm on release. There is no root, debug or manual-date menu.

Canceling or failing dictation does not replace a saved record. Genuine speech errors, phone failures and timeouts stay visible in the same scrolling confirmation component. An uncertain phone response requires **Select: reload saved state** before another mutation; **Back** exits that recovery card. A recovered pending insertion shows the delivery caveat and offers explicit **Select: retry same pin** only after it has been read to the bottom. Back from that pending card records again without canceling or deleting the existing pin. The watch's navigation labels remain English; reminder titles retain their original language.

The normal draft uses a bold Gothic24 reminder title above regular Gothic24 date/time and relative-time details, following Recordatorios's visual hierarchy without shrinking the readable details. The title reserves space for descenders such as `p` and `g`. Date and 12-hour time share one line (`2026-10-15 8:59 AM`), with the relative estimate centered below it on the round face rather than offset by the action bar. Midnight displays as `12:00 AM`; noon as `12:00 PM`. Both text blocks follow the round screen and share the same paged confirmation; no extra screen is introduced. Its deep-red right-hand action bar shows only a white confirmation checkmark; Up/Down still pages through long text without arrow icons. Icons use a transparent palette so no black box appears over the colored ribbon. Confirmation stays unchanged during a fast phone request; after 800 ms, a delayed request adds waiting feedback inline, not a separate status screen. Recovery and error guidance remain visible when needed. The app drawer uses an original 25-by-25-pixel bell-and-check icon.

The relative estimate uses remaining seconds sampled from the phone, then elapsed time on the watch. It updates while reviewing: minutes round up, less than a minute displays **In <1 min**, and reached/passed times disable confirmation. Days/hours/minutes use `d`/`h`/`m`. Transport delay or watch-clock adjustments can affect the estimate; the absolute phone-derived instant is unchanged, and the phone revalidates it when confirming.

The app does not add a calendar event, Microsoft To Do task, second watch alarm or phone-notification service. Outlook.com integration is not in this iteration. There is no Microsoft, GitHub or Gemini login and no custom server.

Pebble provides speech-to-text. Its companion supports cloud or local speech recognition; this app does not itself implement offline transcription. Enable **Settings > Speech Recognition** in the companion and choose the mode you want. Current [companion source](https://github.com/coredevices/mobileapp/blob/ec2156cc38a850e5458addba2a2fb8efa34396df/util/src/commonMain/kotlin/coredevices/util/transcription/TranscriptionService.kt) supports **Spoken Language: Automatic**, English and Spanish, but settings vary by installed version and recognition engine. For bilingual input, use Automatic and a multilingual model/provider, not an English-only local model. Automatic language detection does not guarantee accurate code-switched audio; mixed transcripts and mixed speech recognition are separate acceptance checks. Copilot would interpret the transcript, not improve the microphone or transcribe raw audio.

## Supported phrases

Examples use synthetic reminder text:

- `Buy milk in 20 minutes`
- `Call Sam in an hour`
- `recuerdame en 5 minutos ver mensajes`
- `remind me in 5 minutes to see message`
- `Recuérdame comprar leche en veinte minutos`
- `Comprar leche mañana a las 3 PM`
- `Comprar leche mañana a las tres de la tarde`
- `remind me to revisar prueba en veinte minutes`
- `Call Sam dentro de cinco minutos`
- `Enviar un mensaje mañana a las 8 de la mañana sobre la prueba`
- `Send a message tomorrow at 8 AM about the test`
- `Revisar prueba mañana` (tomorrow at 10 AM)
- `Review the test on Friday` (Friday at 10 AM)
- `Revisar prueba` (the default described below)
- `Buy milk today at 15:30`
- `Buy milk tomorrow at 3 PM`
- `Buy milk on friday at 15:30`
- `Buy milk 2026-10-20 at 15:30` (replace with a future date)
- `At 10 am remind me about the practice equipment`
- `Follow up on the sample deployment at 10 am today`
- `Recordar llamar a Manuel el lunes que viene`
- `Llamar a Manuel el próximo lunes`
- `Llamar a Manuel el 17 de mayo`
- `Llamar a Manuel hoy a las 3:30 p.m.`
- `Llamar a Manuel el jueves al mediodía`
- `Remember to call uncle Robert this Wednesday`
- `Call uncle Robert next Wednesday`
- `Call uncle Robert on November 21`
- `Call uncle Robert on Friday at 3:30 in the afternoon`
- `Call uncle Robert on Friday at noon`
- `Remind me at 8:30 to check out the game` (the next 8:30 AM or PM)
- `Recuérdame revisar el juego a las ocho` (the next 8 AM or PM)

A leading `remind me to`, `remember to`, `recuérdame` or `recordar` is optional. The dictation typo `reminde me` is also accepted. Scheduling words can mix languages independently: `in/en/dentro de`, minute/hour units, English/Spanish weekdays and months, `today/hoy`, `tomorrow/mañana`, and `at/a las/a la/al`. Written relative counts cover 1-99 in English or Spanish; digit counts retain the 1-10080 bound. Title case, accents and language are preserved.

Relative reminders also accept the time first, followed by the reminder text: `en 5 minutos ver mensajes` or `in 5 minutes to see message`. A leading `remind me` is supported; the optional standalone `to` is grammar, while `to-do` remains part of a title. Both five-minute examples use the original phone reference plus exactly five minutes, not a default time or a later confirmation clock. An empty title, competing schedule or unsupported time modifier still needs clarification.

An absolute day/time clause may precede a topic introduced by `about` or `sobre`. The topic stays in the title: the Spanish example above becomes **Enviar un mensaje sobre la prueba**, scheduled for tomorrow at **8:00 AM**. This is a bounded grammar extension, not arbitrary word-order interpretation.

Clocks also work without a date, before the title (`At 10 AM remind me about the practice equipment`) or after it (`Review the test at 10 AM`). They use the next occurrence of that local time: today if still ahead, otherwise tomorrow. A date can follow the clock, as in `Review the test at 10 AM today`; an explicit `today` is never rolled to tomorrow. Dotted `a.m.` / `p.m.`, `noon` / `mediodía` and `3:30 in the afternoon` are supported. Spaces around a clock's colon, such as the emulator's synthetic `11: 59 PM` transcript, are accepted without changing punctuation in the title.

Without AM/PM or a day period, hours 1-12 use the next future AM or PM occurrence. At 11:37 AM, `at 8:30` means **8:30 PM today**; at or after 8:30 PM, it means **8:30 AM tomorrow**. This also applies to whole hours and supported clock words, such as `at eight` / `a las ocho`. If a date is stated, choose the earliest future AM/PM occurrence on that date: `today at 8:30` can mean 8:30 PM, while `tomorrow at 8:30` starts with 8:30 AM. An explicit date is not advanced if both occurrences have passed. Unmarked `12` considers midnight before noon. Hours 0 and 13-23 keep their unambiguous 24-hour meaning; explicit AM/PM and day periods are never changed. A standalone `to` after a leading clock is removed from the title; `to-do` is preserved.

`Next Wednesday`, `el próximo lunes` and `el lunes que viene` mean the next occurrence of that weekday strictly after today, not necessarily the following calendar week. `This Wednesday` and bare weekdays still include today. A month/day without a year, such as `on November 21` or `el 17 de mayo`, uses its next occurrence, at 10 AM when no clock is given. On that date, a passed clock rolls the year forward; explicit ISO dates never roll. Invalid calendar dates, DST gaps/overlaps and dates outside the 366-day limit still require another time.

When time is omitted, the factory defaults are shown below. The AM and PM times can be changed in companion settings:

- **Named day:** 10 AM on that day. `Tomorrow` and standalone `mañana` mean the next day; `today/hoy`, weekdays and ISO dates use their specified day.
- **No day or time:** 8 PM today if the phone's local time is before 8 PM; at or after 8 PM, 10 AM tomorrow.
- **Clock supplied:** resolve it using its explicit period, unambiguous 24-hour value, or the next-AM/PM rule above. Invalid or unsupported times are rejected rather than replaced by a default.

The selected default appears as an exact date/time and relative estimate and still needs confirmation. It is fixed when the phone receives the request; waiting does not roll it to a later default. A named day's 10 AM that has already passed is rejected, not moved to another day. In `8 de la mañana`, `mañana` means **AM**, not tomorrow. Morning phrases such as `por la mañana` without a clear day/time need clarification rather than being treated as tomorrow.

Times accept numeric hours with optional minutes, supported clock words, explicit AM/PM, a day period such as `tres de la tarde` or `3:30 in the afternoon`, or noon. A bare weekday includes today; if neither AM nor PM remains in the future on that day, the request is rejected rather than moved to the following week. Relative expressions retain the original phone receipt time through confirmation and retries.

Ambiguous or competing schedules, unsupported time expressions, recurrence, unsupported relative dates such as `next month` / `la próxima semana` / `el siguiente lunes`, invalid dates, explicit past times and dates more than 366 days away are rejected. Compound dates such as `pasado mañana` / `the day after tomorrow` need an explicit date; day-period-only requests such as `tomorrow afternoon` need a specific time. Redictate using the supported grammar; parse failures display the heard transcript on the watch without logging it. Titles are limited to 160 UTF-8 bytes; long titles are rejected, not silently shortened. DST gaps and repeated local wall times require another time. Changing the phone timezone invalidates an unsubmitted draft; dictate and review it again.

This is deliberately not unrestricted natural-language recognition.

### Reference flow: Recordatorios

For comparison, public [Recordatorios](https://apps.rebble.io/en_US/application/584613b5ca3094659f000af8) version 1.14-rbl1 was installed in the original Round (`chalk`) emulator; its package has no native `gabbro` binary. With synthetic English and Spanish transcripts, the observed flow was **launch > microphone > parsed title/date confirmation > one Select**. There was no separate transcript-approval or date-picker step. Submission ended with **Unable to send timeline pin** in that simulator, so this verifies its interaction flow, not delivery or Round 2 compatibility. No Recordatorios source or assets were imported.

## Settings

In the Pebble phone companion, open **Quick Reminders > Settings** (the gear icon). The configuration page is bundled with the app and needs no hosted website or network connection.

| Setting | Initial value | Behavior |
| --- | --- | --- |
| AM default time | 10:00 AM | Used for a named day with no clock, or tomorrow when today's PM default has passed. Accepts any AM hour and minute. |
| PM default time | 8:00 PM | Used today when no day or time is spoken, if strictly ahead of the phone's local clock. At or after this minute, use tomorrow's AM default. Accepts any PM hour and minute. |
| Ribbon color | Deep red | Deep red, dark blue, dark green, purple or black; the checkmark stays white. |
| Auto-close after saving | On | Return to the watch face after a matching successful insertion response. When off, keep a saved notice with the delivery caveat, Select to record again and Back to exit. |

Save applies the times to new dictation only. An existing draft or pin keeps its original instant; explicit spoken times, relative durations, mandatory confirmation and recovery safeguards do not change. Named-day defaults that have already passed and DST gaps or overlaps still require another time.

Settings are saved separately from reminder recovery data in phone-local `localStorage`. Ribbon color and auto-close are also cached on the watch for startup, updated when settings are saved, and synchronized with normal phone replies if the watch was unavailable. Cancel leaves settings unchanged. Invalid values and storage failures reopen the page with an error; invalid saved settings can be repaired by explicitly saving the page again without clearing reminder data.

## Build and sideload

Use Node.js 22 or later and a native C compiler (`cc`, or the executable path in `CC`) for the tests; no npm dependencies are required. Prefer GCC or Clang for strict host checks: lightweight compilers can miss warnings enforced by CI. The C harness executes the actual watch control/tuple-decoding code against a small SDK stub. It does not validate font metrics, pixels or hardware behavior. On Windows, run the tests and SDK builds in WSL following the [official setup guide](https://developer.repebble.com/sdk/). Cloud authentication and installation can use the native Windows CLI as described below. This project was built with Pebble CLI 5.0.40 and SDK 4.33.1.

From the repository root, in a shell with those tools on PATH:

```text
npm test
cd app
pebble build
```

The output is `app\build\app.pbw`. Its UUID is distinct from Billy and Recordatorios, so it should install separately.

After changing AppMessage keys in `app\package.json`, run `pebble clean` before rebuilding; the SDK can otherwise retain a stale generated message-key header.

### Cloud VM or different networks

Follow the [Pebble sign-in runbook](.github/pebble-sign-in.md) before starting a new login. The latest build was installed successfully through the Mickey agent's already-authenticated `PebbleMickeyDev` WSL session, without another sign-in. The runbook records that exact working install command, the earlier native Windows fresh-login route, profile isolation, expired flows and the CLI verification gate. Reuse an authorized working session rather than replacing it.

The current [Developer Connection guide](https://developer.repebble.com/guides/tools-and-resources/developer-connection.md) supports a CloudPebble proxy connection when the SDK and phone are on different networks. A phone's private LAN IP does not work from an unrelated cloud VM.

1. On the phone, sign in to your Pebble account and connect Round 2.
2. In **Devices**, open the watch's three-dot menu and enable **Dev Connection**. Wait for **Connected to CloudPebble**. Use cloud mode, not **Use LAN developer connection**.
3. Reuse an already-authorized SDK profile when available. Only if a fresh login is necessary, run `pebble login` in the intended environment and complete the browser sign-in with that same Pebble account.
4. From the `app` directory, install with the supported cloud transport:

```text
pebble install --cloudpebble build/app.pbw
```

This is a developer-installation login, not a new runtime login requirement for QuickReminders. Signing a cloud VM into your personal Pebble account requires your explicit approval; do not paste tokens into chat or use token-bearing CLI arguments. Official browser sign-in and remote installation were exercised successfully with an isolated SDK profile; no credentials belong in this repository. Do not port-forward the unauthenticated phone LAN developer port onto the internet.

If login fails with **OAuth broker exchange failed (403): Requester IP mismatch**, run the official CLI and its browser on the same native Windows host. That resolved an earlier WSL/browser failure here; a subsequent native Windows attempt also returned 403, so this is not a universal network/broker fix. The native Windows CLI setup also required `pyreadline3` after a missing-`readline` import error. Use a fresh official login flow rather than reusing an expired link or copying tokens. **Keep the isolated developer profile signed in until the user explicitly instructs you to sign out**, including after installations, tests or session completion.

The cloud connection can install/debug the app; the app itself still creates local pins from its phone JS. The guide explicitly says the separate `pebble insert-pin` developer command is unsupported, so it is not a substitute for testing this app's confirmed-insertion path.

### Same LAN or locally attached USB

For a phone on the SDK computer's trusted local network, enable the companion's LAN developer connection and use:

```text
pebble install --phone <phone-ip> build/app.pbw
```

Alternatively, use `pebble install --adb build/app.pbw` if that SDK environment already has authorized Android ADB access to a physically attached or explicitly forwarded phone. A cloud VM does not gain USB access to your phone automatically. These installation paths have not been exercised against a device here. Do not expose the phone's developer connection to an untrusted network.

## Delivery, recovery and privacy

**Insertion requested is not delivery confirmed.** The [local-pin API](https://developer.repebble.com/guides/pebble-timeline/timeline-local-pins.md) does not document a delivery callback. Automatic exit means the phone's insertion call returned without a synchronous error, not that the watch acknowledged the pin. Check Timeline before treating a reminder as scheduled. Reopening starts the microphone, not a recovery menu; it never replays a pin automatically. If an uncertain request requires reloading, its persisted state and retry caveat appear in the same confirmation component.

The phone saves one pending draft/insertion record before inserting. Reopening restores that record without automatically replaying a pin. **Reload phone state** retrieves it if a response was lost. After reviewing the delivery caveat, **Retry same insertion** uses the same ID and exact time. Existing local IDs update rather than create a second pin, but retrying a pin you already removed is not guaranteed to restore it correctly. Never retry a removed pin; explicitly create a new reminder instead. If the time has passed, retries are rejected.

Creating another reminder replaces the previous local recovery record, not its timeline pin. This is not an archive or a task list. Cancel applies only to an unsubmitted draft. Timeline's built-in **Remove** action is not task completion or calendar deletion. Snooze, recurrence, matching/editing existing pins and reverse synchronization are not implemented.

Phone JS must be running to create a new pin. A desktop/server cannot push directly through the old timeline web API. In the user-reported Round 2 test, one synchronized reminder alerted on time after returning to the watch face and disconnecting Bluetooth. This does not establish long-term retention or uninstall/reinstall behavior; those still need device testing.

Expired drafts reopen without enabling Confirm; change their date/time or cancel them. Already-confirmed retries preserve their exact UTC instant even if the phone timezone changes; an unsubmitted draft still requires redictation and review after travel.

Reminder text and timing are stored in the companion's phone-local `localStorage` and synchronized as pins. That storage is not an Android hardware-backed keystore. The app does not log transcripts or timing, make network requests, or contain credentials. Companion cloud transcription can transmit audio according to your selected speech mode. Use personal reminders only; never add work-account material, real reminders, credentials or exported phone data to this repository or issue reports.

Storage or insertion failures are shown explicitly. If the app reports corrupt local data, stop rather than repeatedly confirming; recovery needs investigation on the phone with private data kept out of logs and issues. This build intentionally does not offer an unverified destructive reset.

## Acceptance gate before Copilot

The user-reported creation, one-alert and disconnected-delivery check above passed, along with one mixed-language phrase. The native-action-bar revision also passed the user-reported automatic-exit, one-pin and one-alert check with the app closed. Recognition across models, restarts and the other physical-device edge cases below have not all been exercised. Emulator transcripts and automated contracts do not substitute for those checks.

For version 0.2.0, the user confirmed that the configurable AM/PM times, auto-close and ribbon colors work on the real watch. Confirmation and Timeline screenshots were also captured with synthetic reminder text. This does not establish the remaining restart, recovery or speech-model checks.

On an authorized phone and Round 2, use synthetic reminders to check:

- Launch opens dictation immediately once, including with a saved pending insertion. A transcript received before phone readiness is retained and sent once. Recording Back exits even if readiness arrives late; no pin replays automatically.
- English, Spanish and code-switched speech transcribes correctly using the chosen companion model; transcript parsing is a separate check.
- Dictation cancel/error paths insert nothing. Confirmation Back cancels an unsubmitted draft, then records once after safe acknowledgement; cancellation failure stays visible and recoverable.
- A short draft confirms directly with Select; a long draft requires reading to the end. A held Select or late release must never confirm a new card.
- An explicit tomorrow-at-8-AM clause before a topic preserves the topic and shows the intended date/time without a timezone line. Named-day-only requests show 10 AM; unscheduled requests show 8 PM today or 10 AM tomorrow according to the cutoff.
- Open companion settings, save custom AM/PM minutes and a ribbon color, reopen the page and app, and verify both persistence and the PM cutoff. Cancel must preserve the saved values. Saving settings while reviewing a draft must not move its instant or insert a pin. With auto-close disabled, successful insertion must show the delivery caveat without exposing a retry action; Select records again and Back exits.
- Long titles and status messages can be read fully on the round screen.
- Confirmation produces one pin and one timely reminder, with no duplicate alert.
- Lost Bluetooth/messages and app/phone restarts preserve recovery identity without automatic replay.
- After observed synchronization, alerts still arrive after closing the app and disconnecting the phone.
- DST, timezone travel and near-future/expired requests require review rather than silently changing the time.

Optional Copilot-through-Actions parsing is **not implemented**. It remains gated on the local device checks and a real PKJS authenticated-encrypted dispatch/artifact transport proof. No Actions runtime workflow or credentials are needed for this build. Future cloud interpretation needs explicit text-sharing consent, supported Copilot authentication, strict draft validation and the same local confirmation boundary. It must not silently fall back to Gemini.

## Store artwork

`store\icon-80.png` and `store\icon-144.png` reuse the original bell-and-check menu icon on white backgrounds at the store's small and large icon sizes. They use integer nearest-neighbor scaling with centered padding to keep the pixel artwork sharp. The watch's 25-by-25 menu icon is unchanged.

The optional store banner is 720 by 320 pixels. Round 2 screenshots must be 260 by 260 pixels, without a watch frame. Store submission and publication are separate from building or installing a PBW.

## Sources and license

The pin/reminder shape is narrowly adapted from [TomBolger/Billy](https://github.com/TomBolger/Billy) under Apache 2.0; see [NOTICE](NOTICE) and [LICENSE](LICENSE). The parser, protocol and Round 2 UI are new. No Billy media assets, Gemini integration, Google account features or native Android companion were imported.

API references: [local pins](https://developer.repebble.com/guides/pebble-timeline/timeline-local-pins.md), [pin structure and reminders](https://developer.repebble.com/guides/pebble-timeline/pin-structure.md), [dictation API](https://developer.repebble.com/docs/c/Foundation/Dictation.md), and [companion speech recognition](https://help.repebble.com/en/articles/14490456-voice-dictation).

The revised `gabbro` emulator flow exercised automatic microphone startup, synthetic English/Spanish/mixed-language transcripts, the fully visible short-draft card, direct Select confirmation, hold-Select editing without accidental submission, and Back cancellation. A long draft blocked early confirmation with a visible explanation; scrolling exposed the remaining date/time/actions and unlocked confirmation. One Select from a reviewed card reached the explicit **local pins are unavailable** error: the SDK's `pypkjs` phone simulator does not expose `Pebble.insertTimelinePin` in this environment. The simulator limitation does not reproduce the successful physical-device delivery reported above; simulator UI coverage and real Timeline delivery are separate evidence.

The native-action-bar revision was also exercised on the actual `gabbro` emulator: a synthetic mixed-language two-hour phrase opened a fully visible short card with its relative estimate, and the unavailable-pin error kept the app open. A separate synthetic UI-protocol long draft verified scrolling, early-confirmation protection and hold-to-edit. Action glyphs remain static while the SDK handles button highlighting; this avoids icons disappearing after the emulator's default press animations. Successful auto-exit and its error/stale/late-response guards execute in the production-C harness; the user subsequently confirmed successful real-watch insertion followed by automatic exit and one timely alert.

A fresh `gabbro` run of the contextual-parser revision used synthetic Spanish dictation with an explicit tomorrow-at-8-AM clause followed by a topic. The actual phone parser and watch displayed the preserved title/topic, next day's date, **08:00** and relative estimate, without a timezone line or redundant button instructions. The original bell/check was also observed in the native emulator app drawer. These are layout/parser observations, not new physical-device delivery checks.

That contextual-parser/default-time build was subsequently installed on the real watch through the existing authorized CloudPebble session. The developer session was preserved. Installation is confirmed; the earlier physical one-pin/one-alert observations remain separate from acceptance of each newly supported phrase.

The later two-state UI revision removes the root/manual-date menus and app-owned startup/success interstitials. Actual `gabbro` screenshots compared Gothic24 with Roboto Condensed21 using synthetic Spanish accents and a long title. Gothic24 keeps more text in the same round-safe scrolling area and was selected over the wider, heavier Roboto option. Long-card scrolling and direct exit after a matching response were exercised in the emulator. The success-transition checks used clearly labeled **UI-protocol-only fixtures** that replace JS replies but leave the native watch binary and resources unchanged. They do not call a pin API, prove delivery or belong on hardware. After review and final checks, the production two-state build was installed on the physical watch through the existing signed-in CloudPebble session, without another login or logout. Native recording/system animations remain; emulator captures establish removal of the app-owned interstitials, not every possible system subframe.

The user subsequently confirmed that the revised flow works on the physical watch. This is flow acceptance, not an additional timed-alert or exhaustive recovery check.

The subsequent time-first/circular-text update was checked with the production parser in the `gabbro` emulator: Spanish leading-time speech produced the expected five-minute draft, and a deliberately wide English title exercised circular paging, early-confirmation protection and the final date/time/delta page. Full-page alignment keeps the footer away from the rim. The reviewed build passed 45 automated tests and was installed via the existing CloudPebble session. No new physical timed-alert result is implied.

The AM/PM and expanded-date revision passed 51 automated tests. Fresh `gabbro` captures using the production parser showed complete title descenders, a single-line date/time including `11:59 PM`, and a centered countdown. A long synthetic title moved the date/time and countdown together to a readable final page. These captures used temporary QuickReminders-only simulator storage; the original simulator files were restored afterward. This revision was installed on the physical watch through the existing signed-in CloudPebble session. Installation succeeded; there is no new physical timed-alert result.

The subsequent next-AM/PM parser update passed 44 targeted parser/phone tests and was installed on the physical watch through the same cached CloudPebble session. It covers unmarked whole hours, hour/minute clocks, named dates, midnight/noon boundaries and the original confirmation/insertion contract. Installation succeeded; this update has no new physical timed-alert result.
