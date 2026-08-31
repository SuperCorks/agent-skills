---
name: web-computer-use
description: Coordinate local web work in Chrome, Comet, Brave, and Safari on this Mac, including Chrome profile selection, parallel Chrome plugin sessions, Keeper/passkey authentication through Computer Use, browser reservations, and busy-browser fallback. Use alongside the browser control skills, not for browser-profile migration or API-only tasks.
---

# Web Computer Use

## Choose the browser and control surface

Use this coordination layer before operating a local browser. Prefer an applicable connector, API, or CLI for semantic work unless the user explicitly requests browser interaction. When available, read the currently installed `chrome:control-chrome` skill before browser work; also read `computer-use:computer-use` before desktop interaction. Resolve their paths from the session's skill catalog; do not hardcode plugin versions or copy their APIs here. If a required skill/tool is unavailable, report that limitation and use only an available, authorized surface.

Chrome, Comet, Brave, and Safari are available on this Mac. Prefer the Chrome plugin for ordinary page work because separate agent sessions can work in parallel. This helper supports plugin mode for Chrome; use Computer Use for the other three browsers. A request for Chrome fixes the browser, but does not itself prohibit Computer Use in Chrome. An explicit request to use only a particular control surface remains binding.

Choose the Chrome profile in this order:

1. The user's explicit choice for this task.
2. Applicable project `AGENTS.md` instructions.
3. Clear task context, such as a supplied tab or a known, verified project/account-to-profile association.
4. The profile whose **visible display name is Default**.

Do not equate that display name with the on-disk `Default` directory. Chrome may combine account and profile labels, such as `Simon (Default)`; match the visible profile label rather than requiring the entire menu item to equal `Default`. Use supported connection metadata or the profile menu through Computer Use to verify the profile. The plugin's family selector alone does not establish which profile it controls. Do not invent profile-selection APIs, infer an account solely from a project's name, or inspect browser profile databases, cookies, local storage, passwords, or session files.

If the profile is ambiguous or Default is missing, inspect available display names through the UI under an exclusive reservation. If no clear match remains, release the reservation and ask which profile to use; do not create, rename, or silently substitute a profile. `--profile` in the helper records a label only; it does not select or verify a profile.

Honor explicit browser/profile choices and firm project instructions. Pass `--pinned` and omit fallbacks in those cases. When the choice is open, try suitable browsers immediately in order **Chrome → Comet → Brave → Safari**, skipping browsers that cannot satisfy the task or verified account requirements. Never migrate authentication state to make a fallback work. A browser being free is not evidence of the correct account.

## Reserve before operating

Use [scripts/browser_lock.py](scripts/browser_lock.py) for all reservations, including before browser connection checks and desktop profile inspection. Read [references/locking.md](references/locking.md) when first using the helper or handling contention, transitions, or recovery. Never implement locks by checking whether a file exists.

| Operation | Reservation |
| --- | --- |
| Chrome plugin page work | Shared Chrome access |
| Computer Use in any browser, including Chrome profile selection and Keeper | Exclusive access to that entire browser **and** the desktop |

Reservations cover every profile of a browser. Each agent uses its own owner identifier and token, even when agents share a task or repository. Include `--task-name` with the actual current task title when available. The helper uses `CODEX_THREAD_ID` automatically, or accepts an explicit `--thread-id`; never infer an ID from the owner label. Obtain a missing title from the available task metadata tools when practical, otherwise leave it absent. Record the selected browser, intended/verified profile, control surface, token, and owner in task context; do not put credentials or page contents in lock metadata.

Only a successful `acquired` or `renewed` response grants access, and only for its returned browser and mode. Renew before every browser-action batch. Keep batches bounded to at most 60 seconds and shorter than the lease's remaining life. Do not leave asynchronous browser actions running outside that batch. If an operation is still running near expiry, renew the lease while observing it; never silently allow access to expire underneath an in-flight action. A lost or expired reservation requires reacquisition and a fresh view of the page before further actions.

Keep one original contention deadline across candidate browsers and helper retries: **at most 600 seconds total per acquisition episode**. Use short, yielding tool waits so the user receives a meaningful update at least once a minute; the helper also emits waiting events every 30 seconds. On timeout, report the blocked browser/desktop resources and return useful completed work. Do not start another ten-minute wait without new user direction or a changed task phase.

## Profiles, authentication, and transitions

- Use only the Chrome plugin's documented tab APIs, each session's own tabs, or explicitly claimed user tabs. Never operate another agent's tab or assume an old handle survived a handoff.
- For profile UI, Keeper, passkeys, native dialogs, or other desktop-only interaction, use `transition --mode computer-use` first. It relinquishes shared access before waiting; no browser action is allowed while the request is pending. A timed-out upgrade no longer owns its former shared reservation.
- Switch to Computer Use **before interacting with the authentication flow**. Preserve the selected browser/profile and target origin. Use Keeper's own autofill or passkey approval UI, confirm the intended account from non-secret labels, and verify sign-in on the target site afterward. Never reveal, copy, type from memory, log, or request passwords, OTPs, or passkey material in chat. If Keeper is locked or requires user presence, prepare the page and hand off.
- Do not assume Keeper is installed or unlocked in every fallback browser. If unavailable, request user sign-in in the selected browser; do not install extensions, weaken security, change authentication methods, or bypass tool access restrictions to get around the blockage.
- While holding exclusive Chrome access, read-only plugin connection/tab checks may establish whether that connection matches the UI-verified profile; do not run simultaneous UI and plugin actions. Return to plugin page work using `transition --mode plugin` only when the profile association is verified and the remaining work needs no desktop UI. This downgrade releases the desktop and retains shared Chrome access. Otherwise continue through Computer Use.
- If the plugin cannot connect to the selected profile, follow its supported diagnostics. Use Computer Use for the same browser only when authorized and available; do not repair the plugin, invoke private APIs, or silently change profile/account. Actual platform denials remain binding.

## Release, hand off, and finish

Release immediately on completion, failure, cancellation, or **any pause for user input**, including login, passkey approval, payment, CAPTCHA, permissions, and review. Do not keep a background renewal process or hold a reservation while awaiting the user's reply. If a tool unexpectedly yields an approval request, release as soon as control returns before asking the user to continue.

Prepare user handoffs through Computer Use in a normal browser window and leave the needed page open. Do not rely on a temporary plugin-controlled tab surviving the turn. Follow the installed plugin's supported preservation/claiming guidance if a page must be carried over; never transfer secret authentication URLs through chat or shell commands. Releasing during handoff intentionally allows other agents to proceed and therefore does not protect the user's browser interaction.

After the user replies, reacquire access, verify the browser/profile and page again, and refresh UI elements or tab handles as appropriate. Do not replay stale clicks or assume authentication succeeded.

At the end, if the user explicitly specified a Chrome profile and it is not already documented for the project, ask whether to record that preference in the project's `AGENTS.md`. Release reservations before asking. Do not edit the file without agreement; if there is no project, do not invent one or suggest a global change instead.

These locks are cooperative; they cannot stop the user or agents that do not follow this skill. They never alter the browsers' native lock files. Follow current tool permissions, confirmation requirements, and the user's applicable instructions; a reservation grants coordination access, not authorization for a purchase, deletion, message, or other external action.

## Optional status extension

The [companion Chrome extension](references/extension.md) monitors one browser, selected automatically from the launching app or through a saved manual choice. It displays a translucent robot while that browser has no Computer Use reservation and an opaque robot with a green dot while it has one. Its popup shows that browser's elapsed time, task names, and Codex task links when IDs are known. A compact notice identifies another browser holding the shared desktop. Chrome-plugin-only reservations do not light the green dot. An unavailable/stale bridge or unidentified browser shows unknown status, not idle. The extension's display selection does not select or verify the browser/profile used by the agent.

The extension is an observer, not a replacement for acquiring and renewing reservations. It requires separate local setup, described in the reference; do not install it automatically as part of ordinary browser work. It reads no browser content or Codex databases and cannot release locks. Task names are captured at acquisition; old leases without start-time/task metadata remain usable and display the missing information honestly.
