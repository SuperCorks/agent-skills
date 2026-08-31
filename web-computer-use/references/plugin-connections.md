# Plugin connections and named profiles

Use the currently installed `chrome:control-chrome` skill for bootstrap, browser-selection rules, complete per-browser documentation, and current APIs. Resolve its path from the session's skill catalog; do not hardcode a cached plugin version. This reference records the selection workflow verified on this Mac, not a replacement browser controller.

## Select a profile without switching desktop windows

1. Acquire shared access to the intended browser (`chrome` or `brave`, `--mode plugin`). Follow the installed skill's initial family-selection procedure before enumerating additional connections. Read the selected browser's complete documentation as required there.
2. Use the supported `agent.browsers.list()` metadata to find extension connections by **family** and **metadata.profileName**. On this installation, `agent.browsers.get('chrome')` and `agent.browsers.get('brave')` selected those families, but a family selector alone did not prove profile identity. `profileIsLastUsed` and `profileOrdering` are hints, not the user's chosen profile or account.
3. Match the intended visible profile name exactly within the intended family. For one unambiguous match, pass that returned connection's `id` to `agent.browsers.get(id)`, read its complete documentation, and retain a distinct browser handle. Never reuse an opaque ID from an earlier task, hardcode an extension-instance ID, or select the first unrelated extension. Reuse a still-valid handle in the same session as the installed skill directs.
4. Call the selected browser's documented session-naming method before opening or claiming tabs. Create tabs from that handle, or claim the exact user tab returned by that connection's supported tab listing. Tabs stay bound to their originating browser/profile. Do not use another profile's tab handle or another agent's tabs.
5. Verify the destination site's account before account-specific work. Connection metadata proves the browser profile, not which website account is signed in.

The profile-selection order in `SKILL.md` still applies. The Chrome profile visibly named **Default** is not necessarily Chrome's on-disk `Default` directory. Missing/duplicate names or unverifiable connection metadata require the exclusive UI verification/handoff procedure; never inspect profile stores to resolve them. For Brave, use an explicit/contextually verified profile or the sole unambiguous connection; ask if several remain plausible. Do not silently map Brave's Work profile to any Chrome profile or website account.

No desktop focus or profile-picker action was required for these plugin selections. Separate connections support separate agent-owned tabs, but the smoke test below did not test simultaneous agents. Computer Use still needs exclusive browser **and desktop** access, even when agents choose different profiles. Read [Chrome profile switching](chrome-profiles.md) only when desktop profile UI is actually needed.

## A browser or profile is absent

An installed ChatGPT extension is not sufficient evidence of a live connection. Follow the plugin's documented extension/bootstrap troubleshooting before concluding that a browser is unsupported or trying another surface.

On this installation, the packaged diagnostic configuration (`scripts/extension-ids.json`) recognized Brave. The supported installed-browser inventory and running-browser check showed Brave installed but closed; its native-host diagnostic passed. Opening Brave through the plugin's documented browser-launch helper made **Brave / Work** appear on the next discovery check. Inspect a launch preview first, preserve existing windows, and use the current helper's supported options rather than inventing flags. The diagnostic's on-disk profile argument is not proof of a display name: verify the resulting connection metadata. Do not keep retrying a disconnected browser indefinitely.

The packaged configuration did not list Comet, and discovery exposed no Comet connection. Treat Comet as unavailable through this installed plugin unless a later supported configuration and verified connection establish otherwise. Do not copy Chrome's native-host manifests into Comet, edit the OpenAI plugin, spoof a browser family, or invoke private control APIs. Use Computer Use when authorized; if the user explicitly requires plugin-only access, report the limitation.

The **ChatGPT** extension provides browser control. The **Web Computer Use** robot extension only displays reservations. Installing either one does not install or validate the other. Safari is excluded from this Mac's companion-extension installation; it remains a Computer Use browser and a possible monitoring target.

## Observed live checks — 2026-08-31

| Browser | Profile from supported connection metadata | Result |
| --- | --- | --- |
| Chrome | Default | Opened a test tab, navigated, read the page, clicked a link, closed the tab |
| Chrome | HOP | Same check passed through a separate connection |
| Chrome | Corcos.ca | Same check passed through a separate connection |
| Brave | Work | Same check passed after starting Brave |
| Comet | No exposed connection | No plugin control verified |

The successful checks used IANA's public reserved-domains page and its Homepage link. An initial `example.com` navigation failed DNS resolution; that was not a disconnected browser or a profile-switch failure. No credentials, account settings, or user tabs were changed. Browser reservations were released afterward. These names and results are dated observations: always rediscover current availability.
