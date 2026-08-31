"""Configuration, explicit scope, and credential boundaries."""
import json
import os
import string
import subprocess
import tomllib
from pathlib import Path
from urllib.parse import urlsplit


class MemoryError(Exception):
    """Safe user-facing error: never include HTTP bodies or credentials."""


def scope_key(scope):
    return scope["workspace"], scope["project"]


def clean_scope(value):
    if not isinstance(value, dict) or any(not isinstance(value.get(k), str) or not value[k].strip()
                                          for k in ("workspace", "project")):
        raise MemoryError("Both workspace and project must be explicit, non-empty strings")
    return {k: value[k] for k in ("workspace", "project")}


class Config:
    def __init__(self, data, path=None):
        self.data = data
        self.path = Path(path).expanduser().resolve() if path else None
        self.state_dir = Path(data.get("state_dir", "~/.local/state/agent-memory")).expanduser().resolve()
        self.server_url = data.get("server_url", "").rstrip("/")
        parsed = urlsplit(self.server_url)
        if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
            raise MemoryError("server_url must be an HTTP(S) URL without embedded credentials")
        if parsed.scheme != "https" and parsed.hostname not in ("127.0.0.1", "localhost", "::1"):
            raise MemoryError("Remote memory servers require HTTPS")
        self.host_id = data.get("host_id", "")
        if not isinstance(self.host_id, str) or not self.host_id or len(self.host_id) > 128:
            raise MemoryError("A stable host_id is required")
        self.scopes = data.get("allowed_scopes", [])
        if not self.scopes:
            raise MemoryError("Configure at least one explicit allowed_scopes entry")
        for item in self.scopes:
            clean_scope(item)
        for item in self.scopes:
            if item.get("parent"):
                self.require_scope(item["parent"])
        self.transcript_roots = [Path(p).expanduser().resolve() for p in data.get("transcript_roots", [
            "~/.codex/sessions", "~/.codex/archived_sessions"])]
        self.timeout = min(max(float(data.get("request_timeout_seconds", 10)), 1), 60)
        self.drain_budget = min(max(float(data.get("drain_budget_seconds", 45)), 1), 300)
        if not isinstance(self.registry_key_id, str) or not self.registry_key_id or len(self.registry_key_id) > 128:
            raise MemoryError("registry_key_id must be a non-empty identifier up to128 characters")

    @classmethod
    def load(cls, path=None):
        path = Path(path or os.environ.get("AGENT_MEMORY_CONFIG", "~/.config/agent-memory/config.json")).expanduser()
        try:
            return cls(json.loads(path.read_text()), path)
        except (OSError, ValueError) as error:
            raise MemoryError("Cannot load agent-memory configuration") from error

    def token(self):
        token = os.environ.get("AI_MEMORY_AUTH_TOKEN")
        if not token and self.data.get("auth_command"):
            command = self.data["auth_command"]
            if not isinstance(command, list) or not command or any(not isinstance(v, str) for v in command):
                raise MemoryError("auth_command must be a non-empty argv array")
            try:
                result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        check=True, timeout=10, text=True)
                token = result.stdout.strip()
            except (OSError, subprocess.SubprocessError) as error:
                raise MemoryError("Memory credential lookup failed") from error
        if not token and self.data.get("token_file"):
            try:
                token = Path(self.data["token_file"]).expanduser().read_text().strip()
            except OSError as error:
                raise MemoryError("Cannot read configured memory credential") from error
        if not token:
            raise MemoryError("No memory credential is configured")
        if "\n" in token or "\r" in token:
            raise MemoryError("Memory credential contains invalid characters")
        return token

    def registry_key(self):
        """Dedicated cross-host receipt key; never reuse a rotating bearer token."""
        try:
            if self.data.get("registry_key_command"):
                command = self.data["registry_key_command"]
                if not isinstance(command, list) or not command or any(not isinstance(v, str) for v in command):
                    raise MemoryError("registry_key_command must be an argv array")
                value = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       text=True, check=True, timeout=10).stdout.strip()
            elif self.data.get("registry_key_file"):
                value = Path(self.data["registry_key_file"]).expanduser().read_text().strip()
            else:
                raise MemoryError("A dedicated registry_key_file or registry_key_command is required")
            if len(value) != 64 or any(character not in string.hexdigits for character in value):
                raise MemoryError("Registry receipt key must be 64 hexadecimal characters")
            return bytes.fromhex(value)
        except (OSError, subprocess.SubprocessError, ValueError) as error:
            raise MemoryError("Registry receipt key lookup failed") from error

    @property
    def registry_key_id(self):
        return self.data.get("registry_key_id", "context-registry-v1")

    def require_scope(self, value):
        scope = clean_scope(value)
        if scope_key(scope) not in {scope_key(item) for item in self.scopes}:
            raise MemoryError("Requested memory scope is not allowlisted")
        return scope

    def resolve_scope(self, repo):
        location = Path(repo).expanduser().resolve()
        if not location.is_dir():
            raise MemoryError("Repository path is not an existing directory")
        for candidate in (location, *location.parents):
            marker = candidate / ".ai-memory.toml"
            if marker.exists():
                try:
                    value = tomllib.loads(marker.read_text())
                except (OSError, ValueError) as error:
                    raise MemoryError("Invalid .ai-memory.toml marker") from error
                if value.get("project") and value.get("workspace"):
                    return self.require_scope(value)
                # Parent meta-projects may have an older workspace-only marker.
                # Only an explicit host root mapping can fill that missing project.
                for entry in self.scopes:
                    if any(Path(p).expanduser().resolve() == candidate for p in entry.get("roots", [])):
                        if value.get("workspace") != entry["workspace"]:
                            raise MemoryError("Workspace marker conflicts with host root mapping")
                        return clean_scope(entry)
                raise MemoryError("Marker must pin a project or have an exact configured parent root")
            if candidate == Path.home():
                break
        for entry in self.scopes:
            if any(Path(p).expanduser().resolve() == location for p in entry.get("roots", [])):
                return clean_scope(entry)
        raise MemoryError("No explicit memory marker or exact root mapping for this path")

    def search_scopes(self, scope, include_parent=False):
        result = [self.require_scope(scope)]
        if include_parent:
            entry = next(item for item in self.scopes if scope_key(item) == scope_key(scope))
            if entry.get("parent"):
                result.append(self.require_scope(entry["parent"]))
        return result
