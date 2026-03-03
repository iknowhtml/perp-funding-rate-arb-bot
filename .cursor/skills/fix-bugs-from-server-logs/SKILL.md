---
name: fix-bugs-from-server-logs
description: Runs the dev server, waits for error/warning logs to appear, analyzes and fixes issues, then re-checks the terminal in a loop until the server runs clean. Use when the user asks to fix bugs from server logs, verify the dev server, or loop until errors are resolved.
---

# Fix Bugs from Server Logs

Iteratively run the dev server, observe logs, fix issues, and re-verify until no errors or warnings remain.

## Workflow

1. **Start the dev server**
   - Run the project dev script (e.g. `pnpm dev` or `npm run dev`) in the background so the process keeps running and logs stream.
   - If the project uses a specific port and it may be in use, use an alternate port (e.g. `PORT=3001 pnpm dev`) or note the EADDRINUSE message to fix binding.

2. **Wait for logs to appear**
   - Allow enough time for the app to start and for periodic work (polling, sampling, cron) to run so that error or warning lines show up (e.g. 15–30 seconds, or longer if the first run is slow).
   - Do not assume “no errors” after only 1–2 seconds.

3. **Inspect the dev server terminal**
   - Read the terminal output for the running dev process (e.g. the terminals folder or the background command’s output file).
   - Look for `[ERROR]`, `[WARN]`, `error:`, `Error:`, stack traces, or project-specific log levels that indicate failures.

4. **Analyze the issue**
   - Identify the root cause from the message and stack trace (e.g. missing env, bad import, contract revert, wrong type).
   - Locate the relevant code (file and area) from the error and repo structure.

5. **Apply a fix**
   - Change code or config only as needed to address the root cause.
   - Prefer minimal, targeted changes.

6. **Re-check the dev server**
   - If the dev runner uses watch/hot reload, wait for it to restart and for the same or new code paths to run.
   - Read the terminal again after another sufficient wait (e.g. 15–30 seconds) so that any recurring or new error/warning has a chance to appear.

7. **Loop until clean**
   - Repeat from step 3: read logs → analyze → fix → wait → read again.
   - Stop when the dev server runs without errors or warnings for a full cycle (or when the user is satisfied).

8. **Handle new errors**
   - If a fix introduces a new error or warning, treat it as the current issue and go through analyze → fix → re-check.
   - Do not leave new errors unresolved before declaring the run “fixed.”

## Conventions

- **Terminal output**: Prefer reading the process output via the path given by the runner (e.g. `terminals/<id>.txt` or the path from the “Output will be written to …” message) rather than assuming a different location.
- **Wait duration**: When in doubt, wait longer (e.g. 20–30 s) so that startup and one full polling/sampling interval complete.
- **One fix per iteration**: Prefer one logical fix per loop iteration so that the cause of any new log line is clear.
- **Typecheck/lint after code changes**: After editing code, run the project’s typecheck and lint (e.g. `pnpm typecheck`, `pnpm biome check .`) and fix any new issues before relying only on dev server logs.

## Checklist (per iteration)

- [ ] Dev server is running (background) and output is being captured.
- [ ] Waited long enough for errors/warnings to appear.
- [ ] Read the dev server terminal output fully.
- [ ] Identified root cause and relevant code.
- [ ] Applied a minimal fix.
- [ ] Waited again after reload/restart.
- [ ] Re-read terminal; no remaining errors/warnings (or new ones addressed).
- [ ] Typecheck/lint pass after code changes.
