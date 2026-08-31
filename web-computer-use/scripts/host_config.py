"""Shared native-host identity. Only the public extension key is distributed."""

import base64
import hashlib
import json
from pathlib import Path

HOST_NAME = "com.supercorks.web_computer_use"
EXTENSION_DIR = Path(__file__).resolve().parents[1] / "extension"


def extension_id():
    manifest = json.loads((EXTENSION_DIR / "manifest.json").read_text())
    public_key = base64.b64decode(manifest["key"], validate=True)
    digest = hashlib.sha256(public_key).hexdigest()[:32]
    return "".join(chr(ord("a") + int(char, 16)) for char in digest)


def allowed_origin():
    return f"chrome-extension://{extension_id()}/"
