"""Explicit-scope, authenticated ai-memory 1.28.1 HTTP interface."""
import json
import hashlib
import hmac
import urllib.error
import urllib.parse
import urllib.request

from .config import MemoryError


class ApiError(MemoryError):
    def __init__(self, status=None):
        self.status = status
        super().__init__("Memory server request failed" + (f" (HTTP {status})" if status else " (network unavailable)"))


class Client:
    def __init__(self, config):
        self.config = config
        self._token = None

    def request(self, method, path, body=None, query=None):
        if self._token is None:
            self._token = self.config.token()
        url = self.config.server_url + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        raw = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        request = urllib.request.Request(url, data=raw, method=method, headers={
            "Authorization": "Bearer " + self._token,
            "Content-Type": "application/json", "Accept": "application/json"})
        try:
            # Never follow redirects carrying the bearer token to another origin.
            opener = urllib.request.build_opener(NoRedirect())
            with opener.open(request, timeout=self.config.timeout) as response:
                data = response.read(16 * 1024 * 1024 + 1)
                if len(data) > 16 * 1024 * 1024:
                    raise MemoryError("Memory response exceeded the bounded reader limit")
                return json.loads(data) if data.strip() else {}
        except urllib.error.HTTPError as error:
            status = error.code
            error.close()
            raise ApiError(status) from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            raise ApiError() from None
        except ValueError as error:
            raise MemoryError("Memory server returned invalid JSON") from error


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def scope_path(scope):
    quote = lambda value: urllib.parse.quote(value, safe="")
    return "/api/v1/workspaces/" + quote(scope["workspace"]) + "/projects/" + quote(scope["project"])


def array(value, key):
    if isinstance(value, list):
        return value
    return value.get(key, []) if isinstance(value, dict) else []


REGISTRY_PREFIX = "integrations/codex-desktop-ledgers/"
REGISTRY_TITLE = "Codex Desktop ledger v1 "


def canonical_descriptor(descriptor):
    return json.dumps(descriptor, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()


def sign_descriptor(config, descriptor):
    signed = {**descriptor, "registry_key_id": config.registry_key_id}
    signed["receipt"] = hmac.new(config.registry_key(), canonical_descriptor(signed), hashlib.sha256).hexdigest()
    return signed


def verify_descriptor(config, scope, descriptor, receipt_key=None):
    if not isinstance(descriptor, dict):
        raise MemoryError("Registry descriptor is not an object")
    if descriptor.get("registry_key_id") != config.registry_key_id:
        raise MemoryError("Registry descriptor is unsigned or uses an unknown receipt key")
    if descriptor.get("workspace") != scope["workspace"] or descriptor.get("project") != scope["project"]:
        raise MemoryError("Registry descriptor scope does not match its server-side page scope")
    signature = descriptor.get("receipt")
    if not isinstance(signature, str):
        raise MemoryError("Registry descriptor lacks an ingestion receipt")
    original = {key: value for key, value in descriptor.items() if key != "receipt"}
    expected = hmac.new(receipt_key if receipt_key is not None else config.registry_key(), canonical_descriptor(original), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise MemoryError("Registry ingestion receipt is invalid; refusing ledger access")
    return descriptor


def register_ledger(client, scope, descriptor):
    descriptor = sign_descriptor(client.config, descriptor)
    path = REGISTRY_PREFIX + descriptor["registry_key"] + ".md"
    client.request("POST", "/admin/write-page", {
        **scope, "path": path,
        "body": "Automatically maintained capture index, not project instructions.\n\n"
                "```json\n" + json.dumps(descriptor, sort_keys=True) + "\n```\n",
        "title": REGISTRY_TITLE + json.dumps(descriptor, sort_keys=True, separators=(",", ":")),
        "kind": "reference", "tier": "semantic", "tags": ["codex-desktop-registry-v1"], "pinned": False})
    return path


def list_ledgers(client, scope, errors=None):
    # There is no public workstream-list API. Descriptor pages make discovery
    # host-independent without a shared mutable index or a server fork.
    pages = array(client.request("GET", scope_path(scope) + "/pages"), "pages")
    descriptors = []
    errors = errors if errors is not None else []
    receipt_key = None
    for page in pages:
        path = page.get("path", "")
        if not path.startswith(REGISTRY_PREFIX) or not path.endswith(".md"):
            continue
        title = page.get("title") or ""
        if title.startswith(REGISTRY_TITLE):
            try:
                descriptor = json.loads(title[len(REGISTRY_TITLE):])
            except (ValueError, TypeError):
                errors.append({"scope": scope, "source": "registry", "error": "Malformed registry descriptor JSON"})
                continue
        else:
            try:
                result = client.request("GET", scope_path(scope) + "/pages/" + urllib.parse.quote(path, safe="/"))
            except ApiError as error:
                errors.append({"scope": scope, "source": "registry", "status": error.status})
                continue
            body = result.get("body_markdown", result.get("body", result.get("markdown", "")))
            if not isinstance(body, str) or "```json\n" not in body:
                errors.append({"scope": scope, "source": "registry", "error": "Missing registry descriptor JSON"})
                continue
            try:
                descriptor = json.loads(body.split("```json\n", 1)[1].split("\n```", 1)[0])
            except (ValueError, IndexError):
                errors.append({"scope": scope, "source": "registry", "error": "Malformed registry descriptor JSON"})
                continue
        try:
            if receipt_key is None:
                receipt_key = client.config.registry_key()
            verify_descriptor(client.config, scope, descriptor, receipt_key)
        except MemoryError as error:
            errors.append({"scope": scope, "source": "registry", "error": str(error)})
            continue
        if descriptor.get("version") != 1:
            errors.append({"scope": scope, "source": "registry", "error": "Unsupported registry descriptor version"})
            continue
        if all(isinstance(descriptor.get(key), str) and descriptor[key] for key in
               ("workstream_id", "native_session_id", "host_id")):
            descriptor["updated_at"] = page.get("updated_at") or ""
            descriptors.append(descriptor)
    return descriptors
