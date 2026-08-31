"""Read only visible Codex transcript records. Never interpret memory as instructions."""
import hashlib
import json
from pathlib import Path

from .config import MemoryError
from .storage import digest

PRIVATE_TYPES = {"reasoning", "thinking", "redacted_thinking", "image", "input_image", "audio"}
SCAFFOLD = ("# AGENTS.md instructions for ", "<environment_context>", "<permissions instructions>",
            "<INSTRUCTIONS>", "<!-- ai-memory:managed-workstream-packet:")


def visible_value(value):
    if isinstance(value, list):
        return [visible_value(item) for item in value
                if not isinstance(item, dict) or item.get("type") not in PRIVATE_TYPES]
    if isinstance(value, dict):
        if value.get("type") in PRIVATE_TYPES or "encrypted_content" in value:
            return None
        return {key: visible_value(item) for key, item in value.items() if key not in {
            "encrypted_content", "reasoning", "thinking", "signature", "audio", "image"}}
    return value


def visible_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "\n".join(filter(None, (visible_text(item) for item in value)))
    if isinstance(value, dict):
        if value.get("type") in PRIVATE_TYPES or "encrypted_content" in value:
            return ""
        if value.get("type") in {"text", "input_text", "output_text"}:
            return visible_text(value.get("text", value.get("content", "")))
        if value.get("type") in {"resource", "resource_link"}:
            return visible_text(value.get("resource", {}).get("text", ""))
        if "content" in value:
            return visible_text(value["content"])
        # Native shell and structured MCP results have visible non-content fields.
        return json.dumps(visible_value(value), sort_keys=True, ensure_ascii=False)
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False)


def chunks(text, maximum=60000):
    raw = text.encode()
    while raw:
        end = min(maximum, len(raw))
        while end and end < len(raw) and raw[end] & 0xC0 == 0x80:
            end -= 1
        yield raw[:end].decode()
        raw = raw[end:]


def normalize_record(record, session_id, source):
    if not isinstance(record, dict):
        return [], ["malformed_record_skipped"]
    payload = record.get("payload", {})
    if not isinstance(payload, dict):
        return [], ["unsupported_payload"]
    record_type = record.get("type")
    kind = payload.get("type")
    content = ""
    role = None
    event_kind = None
    metadata = {}
    if record_type == "compacted":
        event_kind, role = "compaction", "assistant"
        content = visible_text(payload.get("message", payload.get("summary", "")))
    elif record_type != "response_item":
        return [], []
    elif kind in PRIVATE_TYPES or payload.get("channel") == "analysis":
        return [], ["private_record_excluded"]
    elif kind == "message":
        role = payload.get("role")
        if role not in {"user", "assistant"}:
            return [], []
        content = visible_text(payload.get("content"))
        if role == "user" and content.lstrip().startswith(SCAFFOLD):
            return [], []
        event_kind = "message"
    elif kind in {"function_call", "custom_tool_call", "tool_call"}:
        event_kind, role = "tool_call", "assistant"
        name = payload.get("name", payload.get("tool", "tool"))
        body = payload.get("arguments", payload.get("input", ""))
        content = str(name) + ": " + visible_text(body)
        metadata["tool"] = str(name)
    elif kind in {"function_call_output", "custom_tool_call_output", "tool_result"}:
        event_kind, role = "tool_result", "tool"
        content = visible_text(payload.get("output", payload.get("content", "")))
    elif kind == "web_search_call":
        event_kind, role = "tool_call", "assistant"
        content = "web_search: " + visible_text(payload.get("action"))
        metadata["tool"] = "web_search"
    elif kind in {"compaction", "compacted"}:
        event_kind, role = "compaction", "assistant"
        content = visible_text(payload.get("summary", payload.get("content", "")))
    else:
        return [], ["unsupported_response_item:" + str(kind)[:60]]
    if not content.strip():
        return [], ["empty_or_unsupported_visible_content"]
    source_id = next((payload.get(key) or record.get(key) for key in ("id", "call_id", "callId", "uuid")
                      if payload.get(key) or record.get(key)), None)
    # Timestamp+canonical visible data is stable across archive/move and duplicate
    # rollout files; native IDs deduplicate reserialized tool records on resume.
    identity = str(source_id) if source_id else record.get("timestamp", source)
    events = []
    for index, part in enumerate(chunks(content)):
        event_id = "desktop:v1:" + digest([session_id, event_kind, role, identity, content, index])
        events.append({"event_id": event_id, "agent": "codex", "native_session_id": session_id,
                       "source_record_id": str(source_id or source), "kind": event_kind, "role": role,
                       "content": part, "occurred_at": record.get("timestamp"),
                       "metadata": {**metadata, "capture_adapter": "desktop-v1", "chunk": index}})
    return events, []


def header(path):
    try:
        with Path(path).open("rb") as handle:
            line = handle.readline(1024 * 1024)
        record = json.loads(line)
        if not isinstance(record, dict) or not isinstance(record.get("payload"), dict):
            raise MemoryError("Transcript lacks authoritative session metadata")
        payload = record["payload"]
        if record.get("type") != "session_meta" or not isinstance(payload.get("id"), str) or not payload.get("cwd"):
            raise MemoryError("Transcript lacks authoritative session metadata")
        return payload
    except (OSError, ValueError) as error:
        raise MemoryError("Cannot read native transcript metadata") from error


def files(config):
    found = set()
    for root in config.transcript_roots:
        if root.exists():
            for path in root.rglob("rollout-*.jsonl"):
                if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(root):
                    found.add(path.resolve())
    return sorted(found)


def allowed_path(config, path):
    path = Path(path).expanduser().resolve()
    if not any(path.is_relative_to(root) for root in config.transcript_roots) or not path.is_file():
        raise MemoryError("Transcript must be a file inside a configured native transcript root")
    return path


def snapshot(path):
    hasher = hashlib.sha256()
    offset = 0
    with Path(path).open("rb") as handle:
        for line in handle:
            if not line.endswith(b"\n"):
                return {"offset": offset, "prefix_sha256": hasher.hexdigest(),
                        "partial_bytes": len(line), "partial_sha256": hashlib.sha256(line).hexdigest()}
            hasher.update(line)
            offset += len(line)
    return {"offset": offset, "prefix_sha256": hasher.hexdigest()}


def prefix_hash(handle, length):
    handle.seek(0)
    hasher = hashlib.sha256()
    read = 0
    while read < length:
        data = handle.read(min(1024 * 1024, length - read))
        if not data:
            break
        hasher.update(data)
        read += len(data)
    return hasher, read


def scan(path, session_id, cursor=None, baseline=None):
    """Return unseen visible records and a cursor; never consume partial tails.

    Changed prefixes replay only from a validated activation baseline. If that
    baseline disappeared, fail closed instead of importing pre-activation history.
    """
    events, losses = [], []
    cursor = cursor or baseline or {"offset": 0, "prefix_sha256": hashlib.sha256(b"").hexdigest()}
    with Path(path).open("rb") as handle:
        hasher, length = prefix_hash(handle, cursor["offset"])
        if length != cursor["offset"] or hasher.hexdigest() != cursor["prefix_sha256"]:
            if baseline and baseline["offset"]:
                hasher, length = prefix_hash(handle, baseline["offset"])
                if length != baseline["offset"] or hasher.hexdigest() != baseline["prefix_sha256"]:
                    raise MemoryError("Transcript activation prefix changed; capture quarantined, no history replay")
                cursor = baseline
            else:
                cursor = {"offset": 0, "prefix_sha256": hashlib.sha256(b"").hexdigest()}
                hasher = hashlib.sha256()
            losses.append("cursor_prefix_changed_replayed_deduplicated")
        handle.seek(cursor["offset"])
        offset = cursor["offset"]
        for line in handle:
            if not line.endswith(b"\n"):
                losses.append("partial_tail_deferred")
                break
            start = offset
            offset += len(line)
            hasher.update(line)
            if baseline and start == baseline["offset"] and baseline.get("partial_bytes"):
                old_tail = line[:baseline["partial_bytes"]]
                if hashlib.sha256(old_tail).hexdigest() != baseline["partial_sha256"]:
                    raise MemoryError("Pre-activation partial record changed; capture quarantined")
                losses.append("pre_activation_partial_record_excluded")
                continue
            try:
                record = json.loads(line)
            except ValueError:
                losses.append("malformed_record_skipped")
                continue
            visible, omitted = normalize_record(record, session_id, "byte:" + str(start))
            events.extend(visible)
            losses.extend(omitted)
    return events, {"offset": offset, "prefix_sha256": hasher.hexdigest()}, sorted(set(losses))
