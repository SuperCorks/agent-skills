# Browser reservation protocol

## Setup and commands

Python 3 and its standard library are sufficient on macOS. Run the helper from the installed or repository skill directory. Set `WEB_COMPUTER_USE_SKILL` to that actual absolute directory, not a plugin directory. Choose a unique owner for this agent, such as `task-id/agent-id/random-suffix`; keep it and the returned token for subsequent calls.

```sh
WEB_COMPUTER_USE_SKILL=/absolute/path/to/web-computer-use
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" status
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" acquire \
  --browser chrome --mode plugin --owner 'task-id/agent-id/random-suffix' \
  --profile Default --pinned --wait 600
```

`--profile` is Chrome display-name metadata, never profile selection or proof. Add `--pinned` when the user explicitly chooses a browser/profile or project instructions require one. Inferred/default choices need not be pinned. `--pinned` plus any `--fallback` is rejected.

If browser choice is open and all these candidates are suitable:

```sh
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" acquire \
  --browser chrome --mode plugin --owner 'task-id/agent-id/random-suffix' \
  --fallback comet brave safari --wait 600
```

The primary candidate uses `--mode`; fallback candidates always use Computer Use. In this example, a free Chrome plugin connection gets shared Chrome access; otherwise Comet, Brave, or Safari requires exclusive browser and desktop access. Read the returned browser/mode before touching any browser. Plugin mode for non-Chrome browsers is rejected. Omit candidates that cannot satisfy the task, or release an unusable acquired candidate before trying remaining ones with the **same original deadline**.

For profile selection or authentication when already holding a Chrome plugin lease:

```sh
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" transition \
  --token RETURNED_TOKEN --owner 'task-id/agent-id/random-suffix' \
  --mode computer-use --wait 600
```

After verifying the plugin connects to that same Chrome profile:

```sh
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" transition \
  --token RETURNED_TOKEN --owner 'task-id/agent-id/random-suffix' \
  --mode plugin --wait 0
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" renew \
  --token RETURNED_TOKEN --owner 'task-id/agent-id/random-suffix'
python3 "$WEB_COMPUTER_USE_SKILL/scripts/browser_lock.py" release \
  --token RETURNED_TOKEN --owner 'task-id/agent-id/random-suffix'
```

The examples use literal placeholders: substitute the actual owner and returned token. `release` is idempotent for an absent/expired token, but never releases another token or a live lease owned by someone else. Always release in cleanup after browser work, and before waiting for user input. The helper is not a browser controller and does not close tabs.

## Timing and results

- `--wait` defaults to 600 seconds and accepts 0–600. Zero attempts acquisition once, including a nonblocking metadata-guard attempt; a brief metadata collision may therefore return timeout even when the browser itself is free.
- Each call tries all supplied candidates in order on every pass, then polls every two seconds. It uses one monotonic deadline, not a new timeout per candidate. The metadata guard is never held during polling.
- For multiple calls in the same contention episode, compute an original absolute Unix timestamp once (current time + 600) and pass it as `--until ORIGINAL_TIMESTAMP` on every acquisition/transition. `--until` can shorten but never extend `--wait`. Once that deadline passes, stop; do not replace it with a new timestamp. Time spent resolving unsuitable candidates also consumes that budget.
- Foreground waiting commands may remain running. Use the execution tool's yielding session and poll it in intervals no longer than 30 seconds, relaying meaningful progress at least once a minute. Do not issue a blocking ten-minute tool call. Cancellation via SIGINT/SIGTERM cleans up the caller's pending request when possible.
- Standard output contains one final JSON object. Standard error contains JSON `waiting` events immediately upon contention and at most every 30 seconds thereafter. Events identify blocking owners, expiry times, candidate browsers, and browser/desktop/queue resources; they grant no access.
- Exit codes: `0` success (`acquired`, `renewed`, `released`, `absent`, or status `ok`); `1` contention timeout; `2` invalid request, lost ownership, corruption, or I/O failure; `130` cancelled wait.
- An acquired/renewed result includes `lease` and `resources`. The lease contains its random token, owner, state, selected browser/mode, optional Chrome profile label, candidate list, and Unix-second timestamps. A Chrome plugin lease has `{"chrome":"shared"}`; Computer Use adds `"desktop":"exclusive"` alongside the exclusive browser.
- New leases also record `acquired_at`, `mode_since`, and optional `task_name`/`thread_id` for the [status extension](extension.md). Pass the actual task title with `--task-name`; `--thread-id` defaults to `CODEX_THREAD_ID` when available. Acquisition and mode timestamps are independent of renewal time. Older records without these optional fields remain supported.
- `snapshot` returns read-only status with ownership tokens/paths omitted. Unlike `status`, it neither creates store files nor prunes expired leases; the native bridge uses this path and never acquires browser/desktop access.
- Pending requests have **no reserved resources**. They only affect queue admission. Never act on a waiting event or a `status` listing instead of acquiring/renewing your own lease.

## Lifecycle and fairness

Active leases expire five minutes after acquisition/renewal. Renew before every bounded browser-action batch; renew separately while monitoring an unexpectedly long in-flight action, before its lease expires. There is no background daemon and no automatic renewal across model turns. The browser's own process being alive does not prove an agent still owns a reservation.

Pending requests refresh while their acquisition command runs, but expire no later than that command's original deadline or five minutes after its last update. Normal completion, cancellation, and timeout remove pending state. A killed process can leave a pending ticket or active lease until its recorded expiry; other callers reclaim it under the guard. A live, unexpired record must never be removed to accelerate a wait.

An upgrade from plugin to Computer Use relinquishes its shared reader and queues for exclusive browser plus desktop access. Two upgrading readers therefore cannot deadlock by retaining each other's required resource. Earlier queued exclusive requests block later readers/writers for the same browser. A queued Chrome writer does not reserve the desktop, so suitable work in another browser can still proceed. A Computer Use-to-plugin downgrade retains the existing Chrome ownership and releases the desktop atomically, without competing as a new reader.

After a timed-out or cancelled upgrade that entered the queue, the former shared lease is gone. Reacquire if you need to resume plugin work. Invalid requests, ownership errors, and `transition_not_started` do not change the original reservation; do not assume an error released it. `transition_not_started` means the supplied deadline was already elapsed or the metadata guard never became available; release the original lease before pausing. Cancellation before transition initialization can likewise leave the original lease unchanged. An expired token cannot be renewed, and reacquisition creates a different token. Every resume after a user handoff must reacquire and inspect current browser state.

## Storage and recovery

All production callers use `~/.local/state/web-computer-use/locks`, independent of repository, worktree, or installation location. Never use a per-project lock directory in real browsing. `--lock-dir` exists only for isolated tests.

The directory is mode `0700`; lease and guard files are mode `0600`. `.guard.lock` is a permanent file protected by a short-lived `fcntl.flock`. The OS releases that guard when its process exits; file existence does not mean it is locked. Never unlink the guard, which would split cooperating callers across different inodes.

Lease files are named `<browser>.<random-token>.json`. One lease encodes both a browser and any desktop reservation, so there are no partially held resource pairs. Every helper operation inspects all browser lease files under the guard. Writes use a same-directory temporary file, file sync, and atomic replacement. A fallback updates the record before renaming it to its selected browser: if interrupted between those steps, its **contents remain authoritative**, even if its filename still has the primary browser's prefix. Temporary `.tmp` files grant no ownership.

Malformed/unsupported records, duplicate tokens, symlinked files, or unsafe permissions fail closed. Do not delete or rewrite those files on your own; report the exact path and the validation failure. These checks coordinate cooperative agents sharing one local user account, not mutually hostile processes. Do not inspect or change native Chrome/Comet/Brave/Safari lock files.

## Validation scenarios

Run the concurrency/recovery suite from the repository root:

```sh
python3 -B -m unittest discover -s web-computer-use/tests -v
```

The following skill-level scenarios require reasoning/UI review, not assertions that merely match Markdown wording:

| Scenario | Required behavior |
| --- | --- |
| Task explicitly requests Work profile; project suggests Default | Work wins; pin Chrome, verify Work, ask about documenting the preference only after release |
| No explicit profile; project has a firm mapping | Follow that mapping and honor its browser constraints |
| Context has no reliable account/profile evidence | Verify visible Default; do not infer from the repository name |
| Default missing or two plausible visible names | Release, ask for a choice, and make no profile changes |
| Plugin family resolves but profile is unverifiable | Reserve browser + desktop, verify/select via UI; remain on Computer Use if association is still unproven |
| Auth page offers Keeper/passkey flow | Transition before interacting; keep secrets in Keeper and verify the resulting account |
| Keeper locked or user approval required | Prepare normal browser page, release immediately, request user takeover |
| User resumes after other activity | Reacquire; inspect profile, account, page, and current controls before acting |
| Explicit browser is busy | No fallback; stop at the original ten-minute deadline |
| Browser choice open and Chrome unavailable | Try suitable remaining browsers under the same deadline; desktop contention can block every Computer Use fallback |

A harmless live smoke test can select/verify a profile via UI, inspect a public page in an agent-owned tab, and release. Do not submit credentials, change account settings, install software, or operate unrelated user tabs. Report which control surfaces were actually verified; do not claim that a public-page check proves Keeper authentication.
