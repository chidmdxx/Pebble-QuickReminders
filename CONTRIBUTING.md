# Contributing

Fork the repository, make a focused change, and open a pull request against
`main`. Only the repository owner merges changes and publishes releases.
Contributions are under the project's [Apache 2.0 license](LICENSE).

Follow the [build instructions](README.md#build-and-install) and
[Pebble development guidance](.github/skills/pebble-development/SKILL.md).
Use Node.js 22 or later and GCC or Clang for `npm test`; Windows contributors
should use WSL. App changes also need a build for all six supported watches.
Explain the behavior change and checks performed in the PR. For UI changes,
include synthetic screenshots for the affected screen shapes and color modes.
Do not claim an emulator proves physical-watch delivery.

For parser changes, follow the
[phrase regression workflow](.github/skills/phrase-pattern-improvements/SKILL.md).
Add a failing case before changing the grammar.

Use synthetic reminder text in tests, screenshots, and bug reports. Never
commit SDK profiles, tokens, private keys, real dictation, or device details.
Follow [the security policy](SECURITY.md) for private vulnerability reports.

External fork workflows wait for maintainer approval. Passing CI or an
automated review is not permission to merge or publish. Copilot must not merge,
publish, change access controls, or change repository visibility without an
explicit instruction from the owner.
