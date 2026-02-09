---
name: security-guidance
description: Security review checklist for common vulnerabilities with required threat-model and severity/confidence reporting.
---

# Security Guidance

Use this skill to audit code changes for exploitable risks and provide defensive remediation guidance.

## When to use
- Reviewing feature or bug-fix diffs for security impact.
- Assessing trust boundaries, untrusted input handling, and sensitive operations.
- Producing a blocker/non-blocker security verdict before merge.

## Inputs expected
- Diff or changed files.
- Runtime context (web/backend/mobile/CI).
- Auth model, data sensitivity, and exposed entry points.

## Workflow
1. Build a threat model:
- Entry points: where attacker-controlled input enters.
- Trust boundaries: where untrusted data crosses into trusted zones.
- Assets: secrets, PII, money, integrity, availability.
- Attacker goals: data exfiltration, privilege escalation, disruption.

2. Trace sources to sinks:
- Sources: request params, form input, query/body, file uploads, external payloads.
- Sinks: SQL/NoSQL, shell execution, template rendering, filesystem, deserialization, outbound network fetches.

3. Check high-risk classes:
- Injection (SQL/NoSQL/command/template).
- XSS and unsafe HTML rendering.
- AuthN/AuthZ bypass.
- SSRF and unsafe URL fetches.
- Path traversal and file access abuse.
- Secrets leakage and excessive data exposure.

4. Recommend remediation:
- Parameterization, encoding/escaping, allowlists, explicit auth checks, least privilege, safe defaults/timeouts/input size limits.

## Output format (evidence required)
- Threat model summary:
  - Entry points
  - Trust boundaries
  - Sensitive assets
  - Likely attacker goals
- Findings (one item each):
  - Title
  - Severity: `Critical|High|Medium|Low`
  - Confidence: `High|Medium|Low`
  - Impact
  - Affected files
  - Defensive remediation
- Blockers list (high-confidence `Critical`/`High` issues).
- Final security verdict: `pass` or `needs changes`.

## Quality gate / halt conditions
- Halt and mark `needs changes` when any high-confidence `Critical` or `High` finding exists.
- If runtime context is missing and affects the verdict, halt and request that context explicitly.
- Defensive guidance only; do not provide exploit instructions.
