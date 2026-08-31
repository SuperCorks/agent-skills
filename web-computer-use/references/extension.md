# Chrome status extension

The bundled Manifest V3 extension is optional. Chrome starts the Python native host on demand and exchanges JSON over stdin/stdout. There is no listening network port or separately installed daemon. The host runs with the user's normal macOS permissions, but its exposed protocol only reads the fixed reservation store and reports the launching browser's identity; it is not an OS filesystem sandbox.

## What it shows

- **Idle:** robot at 38% opacity, without a green dot when the selected browser has no Computer Use reservation.
- **Computer Use active:** opaque robot plus green dot when the selected browser has a nonexpired, held `computer-use` reservation. This indicates a cooperative reservation, not independent detection of every mouse/keyboard action.
- **Unknown:** translucent robot with a `?` badge when the bridge is missing, disconnected, stale for over six seconds, reports invalid state, or cannot identify which browser to monitor. Unknown is never presented as free.
- The popup shows one browser instead of a four-browser list. It updates elapsed timers every second without rebuilding focused links on every tick. It shows the holding task's title, profile, start time, and a link to open its Codex task when an ID was recorded. That browser's plugin and queued reservations have their own task names/timers; a fallback queue appears for each eligible selected browser.
- Chrome-plugin-only activity remains visible when monitoring Chrome but does not light the Computer Use dot. If another browser holds the shared desktop, a compact notice shows the blocking task and timer. That notice does not turn on the selected browser's green dot or display unrelated reservations.

`acquired_at` begins when a pending request actually acquires access. `mode_since` begins at acquisition or a mode change. Renewals preserve both; an upgrade that relinquishes/reacquires ownership resets both, while a downgrade preserves continuous browser acquisition time and updates mode time. Earlier lease files without these fields show an unavailable elapsed time rather than using their request creation time as a false start time.

## Choose which browser to monitor

The popup's **Browser** selector defaults to **Automatic**. The Python host identifies its parent executable once at startup through macOS `proc_pidpath`, recognizing the standard Chrome, Comet, and Brave app bundles (including helper processes inside them). It reports only `host_browser`, never the executable path or process ID. This identifies the browser running the extension, not whichever browser is frontmost, and does not establish a Chrome profile or account identity. It reads no profile files and does not guess from Chrome-like user-agent strings.

Unknown or renamed app bundles, unavailable process information, and older hosts without identity metadata require a manual selection; Automatic never silently assumes Chrome. The native-host registration must be available to the browser running the extension. The supplied installer targets Chrome by default; using another Chromium browser also requires registration in that browser's supported native-host location (`--manifest-dir`), not just changing the selector.

Choose **Chrome**, **Comet**, **Brave**, or **Safari** to override detection. The choice is saved in this extension profile's `chrome.storage.local` and applies to both the popup and toolbar icon, including after the service worker restarts. It is not synced between profiles or machines. A manual choice can monitor another browser's reservations without switching or controlling that browser. Safari is a monitoring target here, not a claim that this Chromium extension can be loaded into Safari. Choose Automatic again to follow the launching browser.

The `storage` permission is used only for this preference. No task metadata or reservations are cached there. A storage failure is shown in the popup; it does not alter the underlying locks.

## Task names and links

Include the actual task title when acquiring:

```sh
python3 /absolute/path/to/web-computer-use/scripts/browser_lock.py acquire \
  --browser chrome --mode computer-use --pinned \
  --owner 'unique-task-and-agent-owner' --profile Default \
  --task-name 'Actual current task title'
```

The helper captures `CODEX_THREAD_ID` when available. Outside that environment, supply `--thread-id` with the actual Codex task UUID. Do not put a URL in this option. Titles are captured at acquisition; the extension does not query private task databases or invent missing titles. Missing titles fall back to the recorded owner, and missing IDs produce plain text without a link.

The popup creates only `codex://threads/<validated-UUID>` links. This format and the `codex` URL handler were verified in the installed Codex/ChatGPT macOS app. It is a local app link, not a public share link. Opening can require Chrome's external-application confirmation, and the task must be accessible in the installed app. A nonexistent task ID cannot be resolved by the extension.

## Local setup — separate from creating the skill

Keep the extension and Python scripts together in a stable skill directory. A global skill installation is not required. The setup script previews changes by default:

```sh
python3 /absolute/path/to/web-computer-use/scripts/install_native_host.py
```

When local installation is requested, register this companion host:

```sh
python3 /absolute/path/to/web-computer-use/scripts/install_native_host.py --install
```

This writes only this skill's native-host manifest and executable launcher under `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/`. It does not modify the OpenAI Chrome plugin's native host, browser preferences, profiles, or extensions. The launcher uses the absolute Python executable and script location selected during setup; rerun setup if either moves. `--python` selects a different existing Python executable. `--manifest-dir` supports isolated installation tests.

Then, in each Chrome profile where the icon is wanted:

1. Open Chrome's extensions page and enable Developer mode if appropriate for that browser's policy.
2. Choose **Load unpacked** and select the skill's `extension/` directory.
3. Pin **Web Computer Use** to the toolbar and click Refresh if necessary.

Extension installation and browser settings changes must follow the current tool's applicable confirmation policy. Do not bypass managed extension restrictions. No Chrome Web Store publication is necessary for local unpacked use. The public key in `manifest.json` keeps the development extension ID stable across profiles/paths; do not regenerate it casually. No signing private key is stored in this repository.

The one per-user native-host registration can serve the extension in multiple Chrome profiles. All profiles read the same machine-level reservations, while each extension profile saves its own browser selection. Each connected profile has a lightweight on-demand host process, which exits when Chrome closes its connection. A persistent port receives a snapshot every second; a reconnect alarm retries after disconnection. No website host permissions, tab-reading permission, content scripts, or browsing-history permission are requested.

The only native messages accepted are `{"type":"getStatus"}` and `{"type":"subscribe"}`. The host validates the exact extension origin, uses framed JSON with bounded message sizes, reads under the existing guard, and strips ownership tokens and local filesystem paths from successful snapshots. It never creates the reservation directory/guard, prunes expired files, renews leases, or exposes write/force-unlock operations. Expired records are excluded from the display without deletion.

## Validation and preview

```sh
python3 -B -m unittest discover -s web-computer-use/tests -v
node --test web-computer-use/tests/*.test.mjs
```

The test suite uses temporary reservation directories and verifies the native protocol, read-only behavior, browser identity, manual preference restoration/changes, task filtering, shared-desktop notices, timer continuity, and disconnects. Preview setup must not create files; install tests write only temporary directories.

For visual QA without installing the extension, temporarily serve `extension/` locally and open `popup.html?demo=active`. The `idle`, `shared`, `offline`, `mixed`, and `unidentified` demo values cover the other states. `mixed` includes Chrome plugin work, Comet desktop control, and a Brave queue: change the selector to verify filtering and the shared-desktop notice. Preview selections last only until reload and do not write browser storage. This is a visibly labelled fixture preview; demo mode is disabled inside an installed extension. It is not evidence of real native-host connectivity. Stop the temporary preview server afterward; production uses native messaging, not HTTP.

Committed PNG icons need no runtime image library. To regenerate the Apple robot emoji variants on macOS, run `swift scripts/render_icons.swift extension/icons` from the skill directory. Swift/AppKit is used only during asset generation; Python and the browser need no extra packages at runtime.

Relevant platform references: [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [extension storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle), [toolbar actions](https://developer.chrome.com/docs/extensions/reference/api/action), and [loading an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).
