---
name: pebble-development
description: Build, review, and test QuickReminders as a C Pebble watch app with a PebbleKit JS phone companion. Use when changing watch UI, AppMessage keys, local Timeline pins, resources, supported watches, or SDK build instructions. Keep emulator checks separate from physical-watch delivery.
compatibility: Node.js 22 or later, GCC or Clang, Pebble CLI 5.0.40 and SDK 4.33.1. Use WSL on Windows.
---

# Pebble development

## Read the relevant source and live docs

Start with `README.md`, `app/package.json`, and `.github/workflows/tests.yml`. Keep this a C watch app with a PebbleKit JS companion; do not introduce Alloy, a hosted settings page, or a server for local pins.

Fetch only the official pages needed for the change. Use their Markdown versions instead of copying a documentation snapshot:

- [Agent guidance](https://developer.repebble.com/guides/ai-agents.md) and [documentation index](https://developer.repebble.com/llms.txt).
- [Local Timeline pins](https://developer.repebble.com/guides/pebble-timeline/timeline-local-pins.md) and [pin structure](https://developer.repebble.com/guides/pebble-timeline/pin-structure.md).
- [PebbleKit JS communication](https://developer.repebble.com/guides/communication/using-pebblekit-js.md).
- [Building for every Pebble](https://developer.repebble.com/guides/best-practices/building-for-every-pebble.md).
- [Developer Connection](https://developer.repebble.com/guides/tools-and-resources/developer-connection.md) and [SDK setup](https://developer.repebble.com/sdk.md).

Pebble's [upstream agent skill](https://github.com/coredevices/pebble-watchface-agent-skill/blob/main/skills/pebble-watchface/SKILL.md) is an optional reference, not a vendored dependency. These instructions are project-owned. Apply upstream advice to this existing C watchapp; do not adopt its new-project UUID, Emery-only defaults, Alloy conversion, publishing steps, or emulator reset commands automatically.

## Preserve the app's boundaries

- Keep the microphone-capable targets `basalt`, `chalk`, `diorite`, `emery`, `flint`, and `gabbro`. Do not add `aplite`, which has no microphone.
- Review rectangular, round, color, and monochrome behavior when changing UI. Use capability checks and SDK layout APIs rather than one screen's fixed coordinates.
- Trace protocol changes through `app/package.json`, C tuple handling, the phone controller, and tests. Run `pebble clean` after changing message keys so generated headers do not drift.
- Keep insertion behind explicit confirmation. Preserve persisted identity, exact time, stale-response guards, and visible failures. Local pin insertion has no watch-delivery acknowledgement; do not label an accepted call as delivered.
- Check companion support separately from pin-payload tests. The current local-pins guide says custom `actions` are ignored; the existing **Change time** flow depends on a companion that actually supports local `openWatchApp` actions. Do not infer that capability from the general pin schema, an emulator, or a mocked insertion call.
- Use synthetic transcripts and reminder titles. Do not log reminder text, inspect credentials, or put SDK profiles in the repository.

For phrase parsing, follow `../phrase-pattern-improvements/SKILL.md`.

## Verify the changed behavior

Run the smallest affected test files first, then `npm test` from the root. Use GCC or Clang for the native watch harness; the SDK stub checks control flow, not pixels or real-device APIs.

For app, protocol, resource, or build changes, run from `app`:

```text
pebble build
pebble install --emulator gabbro
pebble screenshot --no-open --emulator gabbro screenshot.png
```

Use a temporary output location for screenshots. Repeat UI checks on the affected screen shapes and monochrome/color platforms; one Round 2 capture does not cover all watches. Build all six targets and check the PBW includes their binaries plus `pebble-js-app.js`, as CI does.

Exercise the changed interaction, not only installation: dictation to draft, scrolling before confirmation, cancellation, and applicable error/recovery paths. Report separately what automated tests, emulator runs, and hardware observations establish. An emulator without `Pebble.insertTimelinePin` can exercise the visible failure, not delivery.

If a screenshot shows a watchface or another app, it does not validate QuickReminders. Inspect the launch result and exercise this app without resetting shared emulator data. If dictation or the required companion API cannot be exercised, report that check as unverified rather than substituting a build or native harness result.

Do not install on a physical watch, publish to the store, change authentication, reset emulator data, or rewrite Git history as an automatic cleanup step. Obtain explicit authorization for those actions. Reuse an authorized profile without reading its secrets, and do not sign out unless requested.
