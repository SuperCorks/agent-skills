# Intake

Ask these together, prefilled with whatever you found (Kernel org and pages, GitHub org, existing folders, Chrome profiles, saved projects). Mark each prefilled answer as found, and ask only what you couldn't find. Skip whole groups that don't apply in Extend mode.

## Questions

**Client**
1. Client display name, slug (lowercase, hyphens), and emoji.
2. Agency client (which agency: Red Krypton or another) or direct client?

**Kernel**
3. Does the organization exist? If not: key prefix (2–8 uppercase), avatar, billing tracking on/off, rate and currency.
4. Which Kernel projects exist under the org, and should any be created? Should mappings target the org or specific projects (one org with unrelated codebases maps per project)?
5. Which task is the setup task?
6. Master payer: is the client billed through an agency organization (Red Krypton clients are)?
7. Asana: which Asana project tracks this client, and should unassigned tasks route to Kernel or only Simon's?
8. Toggl: which Toggl project (or one per Kernel project) should time go to?

**GitHub and repos**
9. GitHub org. Is the invite accepted, and under which account (normally `SuperCorks`)?
10. Which repos are in scope (or discover them)?
11. Where does the workspace repo go: the client's org, Red-Krypton, or SuperCorks? (Usually where the children live; SuperCorks when we only contribute through PRs.)
12. Local path on the Mac: `~/redkrypton/projects/<slug>` for Red Krypton clients, the client's own folder for direct clients (for example `~/acme/workspace`). Remote path: `/workspaces/<slug>` unless said otherwise.

**Working rules**
13. Who merges our PRs? Does a merge to the default branch deploy?
14. Branch, ticket, and PR title conventions (Linear, Jira, Asana IDs)?
15. Is Lovable involved (push to main, Simon publishes)?
16. Data sensitivity: PHI, PII, payments, customer data? Is the remote host acceptable for it?
17. Environments: which are test surfaces (demo, staging), and is production off-limits?

**Providers**
18. For each provider (GitHub, GCP/BigQuery, Google Workspace, Vercel, EAS, Supabase, PostHog, Shopify, Cloudflare, npm, AWS, other): do you have access, which account, which project/team/store/region, read-only or full, and who issues credentials (SSO, an IdP such as Okta, key from a person)?
19. Where should the gateway live: workspace root, inside one child, or one per repo?
20. Does any client tooling need credentials on the host itself (git hooks, scripts using an SDK, MCP servers)?

**Accounts and browser**
21. Chrome profile name. Does it exist yet? Raycast launcher wanted?
22. Skill accounts: Asana, GoDaddy, Klaviyo, Iterable, Vimeo OTT, others, and the alias for each.

**Machines and agents**
23. Machines: MacBook and remote, or MacBook only? Full toolchain and credentials on the remote, or code only?
24. Agents: T3 Code, Codex, or both? Any model or effort different from the defaults?
25. Checkout: `folder` (default, and required when the workspace spans several repos) or `worktree`?
26. Remote Codex project name: with the emoji or without?
27. Workspace-specific tooling: per-task worktree script with port reservation, exact-SHA CI wait, Windows bootstrap, other?

**Local stack**
28. Is the full local stack needed (Docker, database, seeds), or only code, tests, and PRs?
29. Is a local app login needed, and how is it created (seed script, account from the client)?

## Summary template

```
Client: <name> (<slug>, <emoji>), <agency|direct>
Kernel: org <name> (<prefix>, exists|create, billing ...); projects <...>; mappings at <org|project>; setup task <key>
Tracking: master payer <org|none>; Asana <project> routed (<me|me_or_unassigned>) with sections mapped; Toggl <project> at <org|project>
GitHub: <org> via <account>; repos <list>; workspace repo <owner>/<slug>-workspace (private)
Paths: Mac <path>; Remote /workspaces/<slug>
Rules: merges by <who>; merge deploys <yes/no>; branches <pattern>; Lovable <yes/no>; data <class>, remote OK <yes/no>
Providers: <provider>: <account>, <target>, <scope>, issued by <who>  (one line each)
Gateway: <command> at <location>; host-side exceptions <none|...>
Chrome: <profile> (<exists|create>); launcher <yes/no>
Skill accounts: <skill>=<alias> ...
Machines: <...>; Agents: <...>; Checkout: <...>; Remote Codex name: <...>
Tooling: <...>
Local stack: <...>; Local login: <...>
User steps expected: <list>
```
