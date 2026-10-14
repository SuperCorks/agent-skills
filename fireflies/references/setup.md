# Fireflies API-key setup

Use the user's requested browser/profile and the installed Web Computer Use guidance when acquiring a key. Verify the visible signed-in account first. Current Fireflies UI: **Settings → MCP & API → Developer Settings → API Key**. Official help also describes **Settings → Developer settings (Personal)** or **Integrations → Fireflies API**. Use an existing key; do not press Refresh/rotate as routine setup because that can break other integrations.

Store a key through stdin, not an argv value, shell history, `.env` committed to Git, or skill instructions:

```sh
# The input producer must securely supply the key without printing it.
<secure-input-producer> | node scripts/fireflies.mjs auth store --stdin --expect-email person@example.com
# Separate account, stored as another Keychain entry:
<secure-input-producer> | node scripts/fireflies.mjs auth store --stdin --account work --expect-email person@example.com
```

`auth store` verifies the key with the API before storing it. It uses `/usr/bin/security -i` with secret input on stdin and checks the saved value in memory. This is macOS-only. On other systems, provide the default `FIREFLIES_API_KEY` through the process environment or a secret manager.

Verify the installed skill:

```sh
node scripts/fireflies.mjs verify --expect-email person@example.com
```

If an environment key overrides the intended Keychain account, use `env -u FIREFLIES_API_KEY node scripts/fireflies.mjs verify` or a named Keychain alias. Never print the environment variable to diagnose authentication.

New global skills are normally discovered in a new agent session. Install user-managed skills under `~/.agents/skills/`; keep repository source free of personal account details and credentials.

Official sources:

- [Authorization](https://docs.fireflies.ai/fundamentals/authorization)
- [Getting an API key](https://guide.fireflies.ai/articles/3737786777-learn-about-fireflies-api)
