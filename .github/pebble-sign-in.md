# Pebble developer sign-in and installation

Use this runbook before troubleshooting CloudPebble authentication. This is a developer-installation login, not a runtime login requirement for QuickReminders.

## Previously successful route

- **First reuse an already-authenticated SDK profile.** The latest QuickReminders build was successfully installed through the Mickey agent's existing WSL CloudPebble session, without any new login. The working command is below.
- A fresh sign-in and an installation using a cached session are different operations. Failed fresh broker authentication does not mean CloudPebble installation is unavailable.
- Coordinate with the owning agent before using its session. Ask it to install the supplied PBW or provide the non-secret executable/environment setup; never read or copy its credential files.
- Build and test in WSL.
- For a new profile, the **native Windows Pebble CLI and VM browser** previously completed authentication successfully. This is a fallback, not a reason to replace a working WSL session.
- When a fresh sign-in is necessary, complete it in the browser on the same machine as its CLI. Do not move the flow to a phone, another computer, or an old browser tab.
- Use an isolated SDK profile outside the repository. **Keep it signed in until the user explicitly instructs you to sign out.** Finishing an installation, test iteration or session is not permission to log out. Reuse the profile across updates rather than restarting authentication.

Both the cached WSL route and the earlier native Windows route installed builds on the real watch. The native Windows setup used Pebble CLI 5.0.40 with Python 3.12 and needed `pyreadline3` after a missing-`readline` import error.

Running the CLI in WSL while opening a browser in Windows failed with `OAuth broker exchange failed (403): Requester IP mismatch`. Native Windows resolved that earlier failure, but a later native Windows retry also returned the same error. This is a previously successful procedure, not a guaranteed fix for every broker/network failure.

## Working cached-session CloudPebble command

On this development host, the already-authorized SDK runs in WSL distro `PebbleMickeyDev`, user `root`, with CLI `/root/.local/bin/pebble`. It uses its existing profile; **do not override `HOME` or `XDG_DATA_HOME`, start a new login, or log it out**.

From this repository's root in Windows PowerShell:

```powershell
$PbwWindows = (Resolve-Path -LiteralPath .\app\build\app.pbw).Path
$PbwWsl = & wsl -d PebbleMickeyDev -u root --exec wslpath -a -u $PbwWindows
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the PBW path in the SDK distro.' }
$PbwWsl = $PbwWsl.Trim()

& wsl -d PebbleMickeyDev -u root --exec env `
    PYTHONUNBUFFERED=1 `
    PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin `
    /root/.local/bin/pebble install --cloudpebble $PbwWsl
if ($LASTEXITCODE -ne 0) { throw 'CloudPebble installation failed.' }
```

The verified installation reported `CloudPebble proxy authentication succeeded`, `Connected`, then `App install succeeded`. No login/logout, token copying, source changes or public upload was required.

If authentication succeeds but the CLI waits for the phone, restore **Connected to CloudPebble** in the phone's Dev Connection settings. If the proxy closes while waiting, rerun the installation after the phone reconnects; do not restart authentication or log out. Unbuffered output makes this connection stage visible.

This is a host-specific existing session, not a credential setup recipe for another machine. If it is unavailable, coordinate with its owner rather than searching for or copying its tokens. The native Windows setup below remains available for a separately authorized fresh sign-in.

## Set up the native CLI only if missing

Reuse an existing native Windows CLI when available. Do not put its environment or authentication files in the repository.

In a fresh native Windows PowerShell:

```powershell
$LocalData = $env:LOCALAPPDATA
$ToolRoot = Join-Path $LocalData 'PebbleQuickReminders\windows-cli'
$PebbleExe = Join-Path $ToolRoot 'Scripts\pebble.exe'

if (-not (Test-Path -LiteralPath $PebbleExe -PathType Leaf)) {
    python -m venv $ToolRoot
    if ($LASTEXITCODE -ne 0) { throw 'Native Windows virtual environment setup failed.' }
    & (Join-Path $ToolRoot 'Scripts\python.exe') -m pip install pebble-tool==5.0.40 pyreadline3
    if ($LASTEXITCODE -ne 0) { throw 'Native Windows Pebble CLI installation failed.' }
}
& $PebbleExe --version
```

If reusing a CLI installed elsewhere, set `$PebbleExe` to that executable's absolute Windows path instead.

## Sign in using an isolated profile

Initialize once in a fresh native PowerShell, or continue the shell above before its environment has been isolated. Resolve paths **before** overriding `LOCALAPPDATA`; otherwise repeated initialization can accidentally nest profiles. For a retry in the same shell, rerun only `login --verify-login`, not this initialization block.

```powershell
$LocalData = $env:LOCALAPPDATA
# Replace this executable path when reusing a CLI installed elsewhere.
$PebbleExe = Join-Path $LocalData 'PebbleQuickReminders\windows-cli\Scripts\pebble.exe'
$AuthRoot = Join-Path $LocalData 'PebbleQuickReminders\developer-auth'
if (-not (Test-Path -LiteralPath $PebbleExe -PathType Leaf)) {
    throw 'Set PebbleExe to the existing native Windows CLI, or complete setup first.'
}
New-Item -ItemType Directory -Force -Path $AuthRoot | Out-Null

$env:HOME = $AuthRoot
$env:USERPROFILE = $AuthRoot
$env:XDG_DATA_HOME = Join-Path $AuthRoot 'data'
$env:APPDATA = Join-Path $AuthRoot 'roaming'
$env:LOCALAPPDATA = Join-Path $AuthRoot 'local'
$env:PYTHONUNBUFFERED = '1'

& $PebbleExe login --verify-login
if ($LASTEXITCODE -ne 0) {
    throw 'Pebble sign-in failed. Do not install or assume authentication succeeded.'
}
& $PebbleExe login --status
```

The CLI opens the official browser flow and receives its callback on the same machine. Use the newly opened VM browser tab and the same Pebble account used by the phone companion.

**A browser page saying "Authentication complete" is not proof of successful CLI authentication.** The CLI still has to exchange and verify the result. Wait for its successful exit and check `login --status` before installing. A user's "Signed in" acknowledgement alone is not the verification gate.

For an agent running each command in a fresh process, repeat the isolated-profile environment setup in every login, status, installation and logout command. Shell environment changes do not persist between tool calls. Reuse the same resolved profile path for the ongoing test loop.

## Install the built package

On the phone, enable **Devices > watch menu > Dev Connection** and wait for **Connected to CloudPebble**. Use cloud mode, not the LAN developer connection.

In the same isolated native PowerShell, from this repository's root:

```powershell
Push-Location .\app
try {
    & $PebbleExe install --cloudpebble build\app.pbw
    if ($LASTEXITCODE -ne 0) {
        throw 'CloudPebble installation failed.'
    }
} finally {
    Pop-Location
}
```

Wait for `App install succeeded`. Installation does not itself prove Timeline delivery; the reminder still needs an explicit watch confirmation and an observed pin.

## Expired flow or requester-IP failure

- For an expired flow, cancel only its known CLI process, then run a fresh `login --verify-login`. Complete the newly opened tab promptly; never reuse an earlier authorization URL.
- For `Requester IP mismatch`, first check that both the CLI and browser are native Windows processes on the same VM. Do not switch back to WSL authentication or move the browser flow to another machine.
- If that known route still returns 403, report the broker rejection and stop repeated unchanged attempts. Same-host execution alone does not prove the broker sees an acceptable network path. A stable authorized connection or help from Pebble may be needed.
- Do not spoof IP headers, bypass the broker, scrape/copy tokens, use token-bearing CLI arguments, or modify SDK authentication code to force success. Do not kill unrelated browser or Python processes.
- Never commit account identities, credentials, SDK profiles, browser cookies, authorization URLs, personal reminders or phone screenshots.

## Sign out only when explicitly instructed

Do not run logout automatically, including when testing is finished. Only after the user explicitly requests sign-out, use the same isolated environment and verify the result:

```powershell
& $PebbleExe logout
& $PebbleExe login --status
```

The expected status is `logged out`. Do not log out a shared SDK profile or delete credential files manually.

Reference: [official Developer Connection guide](https://developer.repebble.com/guides/tools-and-resources/developer-connection.md).
