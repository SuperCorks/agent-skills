#!/usr/bin/env python3
"""Validate structural and offline-safety invariants for a change explainer."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path


class ExplainerParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.declarations: list[str] = []
        self.tags: list[str] = []
        self.ids: set[str] = set()
        self.local_links: list[str] = []
        self.external_assets: list[str] = []
        self.disallowed_tags: list[str] = []
        self.style_blocks: list[str] = []
        self.script_blocks: list[str] = []
        self.title_parts: list[str] = []
        self.html_lang = ""
        self.has_charset = False
        self.has_viewport = False
        self._capture: str | None = None
        self._buffer: list[str] = []

    def handle_decl(self, decl: str) -> None:
        self.declarations.append(decl)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        values = {key.lower(): (value or "") for key, value in attrs}
        self.tags.append(tag)

        if tag == "html":
            self.html_lang = values.get("lang", "").strip()
        if tag == "meta":
            self.has_charset = self.has_charset or bool(values.get("charset", "").strip())
            self.has_viewport = self.has_viewport or values.get("name", "").lower() == "viewport"
            if values.get("http-equiv", "").lower() == "refresh":
                self.external_assets.append("meta refresh")

        element_id = values.get("id", "").strip()
        if element_id:
            self.ids.add(element_id)

        if tag == "a":
            href = values.get("href", "").strip()
            if href.startswith("#") and len(href) > 1:
                self.local_links.append(href[1:])
            if values.get("ping", "").strip():
                self.external_assets.append(f"anchor ping={values['ping']}")

        if tag == "script" and values.get("src", "").strip():
            self.external_assets.append(f"script src={values['src']}")
        if tag == "link" and "stylesheet" in values.get("rel", "").lower():
            self.external_assets.append(f"stylesheet href={values.get('href', '')}")
        if tag in {"img", "audio", "video", "source"}:
            for attribute in ("src", "srcset", "poster"):
                resource = values.get(attribute, "").strip()
                if resource and not resource.startswith("data:"):
                    self.external_assets.append(f"{tag} {attribute}={resource}")
        if tag in {"image", "use"}:
            resource = values.get("href", values.get("xlink:href", "")).strip()
            if resource and not resource.startswith(("#", "data:")):
                self.external_assets.append(f"{tag} href={resource}")
        if tag == "form" and values.get("action", "").strip():
            self.external_assets.append(f"form action={values['action']}")
        if tag in {"iframe", "object", "embed"}:
            self.disallowed_tags.append(tag)

        if tag in {"style", "script", "title"}:
            self._capture = tag
            self._buffer = []

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._capture == tag:
            content = "".join(self._buffer)
            if tag == "style":
                self.style_blocks.append(content)
            elif tag == "script":
                self.script_blocks.append(content)
            else:
                self.title_parts.append(content)
            self._capture = None
            self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buffer.append(data)


def validate(path: Path) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    if not path.is_file():
        return [f"file does not exist: {path}"], warnings
    if path.suffix.lower() != ".html":
        errors.append("artifact must use the .html extension")

    source = path.read_text(encoding="utf-8")
    parser = ExplainerParser()
    try:
        parser.feed(source)
        parser.close()
    except Exception as exc:  # HTMLParser failures should be actionable.
        errors.append(f"HTML parsing failed: {exc}")
        return errors, warnings

    declarations = " ".join(parser.declarations).lower()
    if "doctype html" not in declarations:
        errors.append("missing <!doctype html>")
    if not parser.html_lang:
        errors.append("<html> must declare a lang attribute")
    if not parser.has_charset:
        errors.append("missing a charset meta tag")
    if not parser.has_viewport:
        errors.append("missing a viewport meta tag")
    if not "".join(parser.title_parts).strip():
        errors.append("missing a non-empty <title>")
    for required in ("style", "main", "h1"):
        if required not in parser.tags:
            errors.append(f"missing required <{required}> element")

    if parser.external_assets:
        errors.append("external or non-embedded assets found: " + ", ".join(parser.external_assets))
    if parser.disallowed_tags:
        errors.append("disallowed embedded runtime tags found: " + ", ".join(parser.disallowed_tags))

    missing_anchors = sorted(set(parser.local_links) - parser.ids)
    if missing_anchors:
        errors.append("local links target missing ids: " + ", ".join(missing_anchors))

    styles = "\n".join(parser.style_blocks)
    scripts = "\n".join(parser.script_blocks)
    if not re.search(r"(?is)\bpre\b[^\{]*\{[^}]*white-space\s*:", styles):
        errors.append("CSS must explicitly preserve whitespace for <pre> blocks")

    script_network = re.compile(
        r"(?is)\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|"
        r"\bEventSource\s*\(|\bsendBeacon\s*\(|\bimport\s*\("
    )
    if re.search(r"(?is)@import", styles):
        errors.append("CSS contains a disallowed @import")
    css_urls = re.findall(r"(?is)url\s*\(\s*([^)]+?)\s*\)", styles)
    non_embedded_urls = [
        value.strip().strip("'\"")
        for value in css_urls
        if not value.strip().strip("'\"").startswith(("data:", "#"))
    ]
    if non_embedded_urls:
        errors.append("CSS contains non-embedded URL(s): " + ", ".join(non_embedded_urls))
    if script_network.search(scripts):
        errors.append("JavaScript contains a network-capable API")

    if re.search(r"(?i)\bTODO\b|\{\{[^}]+\}\}|\[PLACEHOLDER\]", source):
        errors.append("unfinished placeholder content found")
    if "main" in parser.tags and "nav" not in parser.tags:
        warnings.append("no <nav> found; confirm the reading path is still clear")

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path, help="Path to the generated HTML explanation")
    args = parser.parse_args()

    errors, warnings = validate(args.artifact.expanduser().resolve())
    for warning in warnings:
        print(f"WARNING: {warning}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)

    if errors:
        print(f"Validation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1
    print("Validation passed: self-contained HTML invariants satisfied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
