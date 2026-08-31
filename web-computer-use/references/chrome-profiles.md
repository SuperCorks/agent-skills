# Chrome profile switching through Computer Use

Use Chrome's native **Window** menu in the macOS menu bar to activate an existing window in the desired profile. This is distinct from the avatar/profile picker and from the **Profiles** menu. Use the currently installed Computer Use skill for its supported APIs; do not hardcode plugin paths, version numbers, UI indexes, or private activation calls.

## Verified switching procedure

1. Acquire exclusive Chrome **and** desktop access using the [reservation helper](locking.md). Keep that same reservation across profile switches and renew before each bounded action batch. Profile windows do not provide independent Computer Use access.
2. Obtain fresh Chrome app state. Dismiss an observed extension popup or profile menu before selecting another main window; do not mistake a popup's accessibility tree for the browser window.
3. Open **Window** in Chrome's native macOS menu bar. Inspect the current window list and select the desired existing window by its observed title or custom name. Do not use stale indexes or guess a title from a task, project, or filesystem directory.
4. Immediately obtain fresh app state. Verify the profile using Chrome's actual profile label, such as `Simon (HOP)` in the window's accessibility title, or by reading the profile menu without selecting another profile. Also require a usable main-window accessibility tree and screenshot. The address/search bar and the expected page should be present; a title alone or an extension popup is insufficient.
5. Only after this verification, inspect the current page and continue in that profile. Obtain fresh controls after every subsequent UI change. If a different profile appeared, perform no account-specific action; use a newly inspected Window menu to select another candidate.

There is no need to stop/restart Computer Use between successful switches. A Window-menu switch changes which existing Chrome window is targeted; it does not establish which profile the Chrome Codex plugin connects to. Verify that separately before changing control surfaces.

## Make window selection unambiguous

Chrome's Window menu normally lists tab titles, which can be identical across profiles. For an **agent-created** work window whose actual profile has been verified, use **Window → Name Window…** and assign a descriptive name such as `Agent — HOP` or `Agent — Corcos.ca`. This names a window, not a Chrome profile. The name remains recognizable when its selected tab changes.

Do not rename a user-owned window or overwrite an existing custom name merely to simplify automation. Use its observed title and verify the actual profile after selection. If multiple candidates share a title, inspecting a candidate is acceptable under the reservation, but do not interact with account-specific content until the profile is verified.

Treat custom names as hints, not authority: users can rename windows, close them, open replacements, or move work between them. Reinspect the native window list and profile after every handoff. Do not put site contents, secrets, or permanent task-to-profile assumptions into window names.

## A profile has no existing window

The Window menu can only select windows that already exist. Use the visible profile picker to discover profiles and, when necessary, open a window for an existing chosen profile. Do not create a new Chrome profile. Inspect the result immediately; if usable, verify the profile and optionally name the agent-created window for later Window-menu switching.

The profile picker is not the preferred route for routine switches on this Mac because of the observed Computer Use failure. If opening a previously closed profile produces that failure, use the recovery procedure below rather than assuming the switch succeeded or creating repeated extra windows.

## If the window becomes inaccessible

The observed failure returns a window title but no useful main-window controls and a null screenshot. It is different from an ordinary popup covering the page, where the popup still has a screenshot and accessible controls.

- Stop profile-specific actions. Never type blindly, replay old coordinates/indexes, or treat a title as proof that the window is controllable.
- Query fresh app state once. If a popup is exposed, dismiss that observed popup and query again. If the native Window menu is still exposed, select the intended existing window there and verify again.
- If neither the window nor a supported activation route is available, release the browser/desktop reservation and ask the user to bring the intended profile's Chrome window forward. If necessary, ask them to restart the ChatGPT/Codex desktop app with that profile window available. Preserve the Chrome windows and tabs; do not repeatedly restart Chrome or close user windows as a workaround.
- Reacquire after the user resumes, then verify the actual profile and page from fresh state. Keep no reservation during the handoff. Re-importing the control library or resetting a scripting session is not evidence that the Computer Use service restarted.
- Do not use this recovery path to evade a permission denial or managed-browser restriction. Do not edit profile/session files, modify plugins, invoke private APIs, or substitute an unauthorized control surface.

## Validation and limits

On 2026-08-31 on this Mac, avatar/profile-picker switches intermittently left Computer Use with a title-only result and no screenshot. Restarting the desktop app restored access temporarily; this did not establish the internal cause.

The native Window-menu procedure passed a controlled sequence of six consecutive switches: **Default → Corcos.ca → HOP → Default → HOP → Corcos.ca → Default**. Each destination had the correct Chrome profile label, address/search controls, and a non-null screenshot. No desktop-app or Chrome restart was needed during this sequence. Named agent-created setup windows were used for HOP and Corcos.ca; an existing observed title was used for Default.

An earlier repetition was interrupted by a status-extension popup. The check stopped instead of treating that popup as the destination window, then passed after the popup was dismissed and the controlled run repeated. Avoid concurrent human interaction during a diagnostic sequence; cooperative reservations cannot prevent it.

This is a tested workflow for existing windows, not a claim that the underlying Computer Use bug is fixed or that every display/Space arrangement and unopened profile has been validated. Preserve the verification and handoff checks even when the window names look correct.
