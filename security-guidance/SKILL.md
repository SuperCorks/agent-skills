---
name: security-guidance
description: A definitive checklist and detection guide for common security vulnerabilities (XSS, Injection, Dangerous Sinks).
---

# Security Guidance & Vulnerability Detection

Use this skill to audit code for security risks. It covers 9 high-risk patterns.

## 1. Command Injection (RCE)
**Risk**: Executing untrusted input in a shell.
**Sinks to Watch**: `exec`, `spawn`, `execSync`, `os.system`, `subprocess.call`.
**Mitigation**:
*   Avoid shell execution if possible (use API alternatives).
*   If necessary, never concatenate strings. Use argument arrays (e.g., `['ls', '-l']` not `'ls -l'`).
*   Validate input strictly against an allowlist.

## 2. Cross-Site Scripting (XSS)
**Risk**: Rendering untrusted HTML/JS in the browser.
**Sinks to Watch**: `.innerHTML`, `dangerouslySetInnerHTML` (React), `v-html` (Vue), `document.write()`.
**Mitigation**:
*   Prefer text content bindings (e.g., `textContent` or standard interpolation `{}`).
*   Sanitize HTML using a library like DOMPurify before rendering if HTML is required.

## 3. SQL Injection
**Risk**: Concatenating user input into SQL queries.
**Sinks to Watch**: Raw query strings, string formatting in queries.
**Mitigation**:
*   ALWAYS use parameterized queries / prepared statements (e.g., `$1`, `?`).
*   Use an ORM/Query Builder that handles escaping automatically.

## 4. Path Traversal
**Risk**: Accessing files outside the intended directory.
**Sinks to Watch**: `fs.readFile(userInput)`, `path.join(base, userInput)`.
**Mitigation**:
*   Validate that the resolved path starts with the expected base directory.
*   Strip `..` and null bytes.

## 5. Unsafe Deserialization
**Risk**: Deserializing objects that execute code on load.
**Sinks to Watch**: `pickle.load()` (Python), `serialize()`/`unserialize()` (PHP).
**Mitigation**:
*   Use safe data formats like JSON (`json.loads`).
*   Avoid native serialization formats for untrusted data.

## 6. Server-Side Request Forgery (SSRF)
**Risk**: Server fetching URLs provided by the user.
**Sinks to Watch**: `fetch(userInput)`, `axios.get(userInput)`.
**Mitigation**:
*   Validate the URL protocol (allow only http/https).
*   Block requests to private IP ranges (localhost, 10.x, 192.168.x).

## 7. Hardcoded Secrets
**Risk**: Committing keys to the repo.
**Patterns**: `API_KEY = "..."`, `password: "..."`.
**Mitigation**:
*   Use Environment Variables (`process.env.API_KEY`).
*   Use a secrets manager.

## 8. Template Injection (SSTI)
**Risk**: User input evaluated by a template engine.
**Sinks to Watch**: User input passed directly to template compilation.
**Mitigation**:
*   Pass data as context variables, not as part of the template string.

## 9. GitHub Actions Injection
**Risk**: User input in shell commands within YAML workflows.
**Sinks to Watch**: `run: echo "${{ github.event.title }}"`.
**Mitigation**:
*   Use intermediate environment variables:
    ```yaml
    env:
      TITLE: ${{ github.event.title }}
    run: echo "$TITLE"
    ```

## Review Checklist

- [ ] Are any "Sinks to Watch" present in the changed code?
- [ ] Is user input sanitized/validated *before* reaching the sink?
- [ ] Are secrets removed from source code?
