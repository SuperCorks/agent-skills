#!/usr/bin/env python3
"""Behavior checks for the renderer; all artifacts stay in temporary directories."""

import base64
import copy
import json
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

from build_atlas import MANIFEST, Renderer, write_output


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6fWQAAAAASUVORK5CYII=")


class Document(HTMLParser):
    def __init__(self, content):
        super().__init__()
        self.tags = []
        self.feed(content)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class RendererTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        (self.root / "first.png").write_bytes(PNG)
        (self.root / "shared.png").write_bytes(PNG)
        self.image = {"src": "first.png", "caption": "A captured screen", "alt": "A screen with a continue control"}
        story = {
            "id": "first-story", "title": "Finish a flow", "persona": "reader",
            "purpose": "Complete the existing flow", "preconditions": ["The first screen is open"],
            "trigger": "Choose Continue", "steps": [{"action": "Choose Continue", "result": "The next screen opens", "images": [self.image]}],
            "outcome": "The next screen is visible",
        }
        second = copy.deepcopy(story)
        second.update(id="second-story", title="Revisit a screen")
        second["steps"][0]["images"][0]["src"] = "shared.png"
        self.data = {
            "id": "test-atlas", "title": "Example product", "summary": "Renderer test data",
            "personas": [{"id": "reader", "name": "Reader", "description": "Uses the example flow"}],
            "stories": [story, second],
            "sources": [{"label": "Reference", "url": "https://example.com/docs"}],
        }

    def render(self, layout="single", notes="no", data=None):
        return Renderer(data or self.data, self.root, layout, notes).build()

    def assert_links_resolve(self, files):
        for filename, content in files.items():
            if not filename.endswith(".html"):
                continue
            document = Document(content.decode())
            for tag, attrs in document.tags:
                value = attrs.get("src") or attrs.get("href")
                if not value:
                    continue
                parsed = urlsplit(value)
                if parsed.scheme:
                    continue
                if not parsed.path:
                    destination = filename
                else:
                    destination = str((self.root / filename).parent.joinpath(parsed.path).resolve().relative_to(self.root))
                self.assertIn(destination, files, f"Broken dependency in {filename}: {value}")
                if parsed.fragment:
                    target = Document(files[destination].decode())
                    self.assertIn(parsed.fragment, [a.get("id") for _, a in target.tags])

    def test_layouts_resolve_links_and_deduplicate_shared_assets(self):
        for layout in ("single", "catalog"):
            with self.subTest(layout=layout):
                files = self.render(layout)
                self.assertEqual(1, len([name for name in files if name.startswith("images/")]))
                self.assert_links_resolve(files)
                pages = [Document(content.decode()) for name, content in files.items() if name.endswith(".html")]
                self.assertEqual(2, sum("data-view-image" in attrs for page in pages for _, attrs in page.tags))

    def test_notes_are_optional_and_catalog_contains_all_story_ids(self):
        for layout in ("single", "catalog"):
            for notes in ("no", "yes"):
                files = self.render(layout, notes)
                pages = [Document(body.decode()) for name, body in files.items() if name.endswith(".html")]
                self.assertEqual(2 if notes == "yes" else 0, sum(tag == "textarea" for page in pages for tag, _ in page.tags))
                for page in pages:
                    ids = [attrs["id"] for _, attrs in page.tags if "id" in attrs]
                    self.assertEqual(len(ids), len(set(ids)))
                if layout == "catalog":
                    story_page = files["stories/first-story.html"].decode()
                    self.assertIn('"id": "second-story"', story_page)

    def test_pages_follow_the_kernel_document_contract(self):
        title = 'Finish "the" flow & leave'
        self.data["stories"][0]["title"] = title
        self.data["stories"][0]["alternatives"] = [{
            "title": "Retry", "detail": "When the request times out, retry it.",
            "steps": [{"action": "Choose Retry", "result": "The request runs again"},
                      {"id": "retry-confirmed", "action": "Confirm", "result": "The request completes"}],
        }]
        for layout in ("single", "catalog"):
            for notes in ("no", "yes"):
                with self.subTest(layout=layout, notes=notes):
                    files = self.render(layout, notes)
                    pages = {name: body.decode() for name, body in files.items() if name.endswith(".html")}
                    self.assertEqual(1 if layout == "single" else 3, len(pages))
                    for name, body in pages.items():
                        root = next(attrs for tag, attrs in Document(body).tags if tag == "html")
                        self.assertEqual(("atlas", "1"), (root.get("data-kernel-kind"), root.get("data-kernel-contract")), name)
                    page = pages["index.html" if layout == "single" else "stories/first-story.html"]
                    tags = Document(page).tags
                    steps = [attrs["id"] for tag, attrs in tags if tag == "li" and attrs.get("class") == "step"]
                    expected = ["first-story-step-1", "first-story-alt-1-step-1", "retry-confirmed"]
                    self.assertEqual(expected + (["second-story-step-1"] if layout == "single" else []), steps)
                    boxes = [attrs for tag, attrs in tags if "data-kernel-notes" in attrs]
                    local = [(tag, attrs.get("class")) for tag, attrs in tags if "data-kernel-local" in attrs]
                    if notes == "no":
                        self.assertEqual(([], []), (boxes, local))
                        continue
                    self.assertEqual("story:first-story", boxes[0]["data-kernel-notes"])
                    self.assertEqual(title, boxes[0]["data-kernel-notes-title"])
                    self.assertIn('data-kernel-notes-title="Finish &quot;the&quot; flow &amp; leave"', page)
                    self.assertEqual([("p", "review-explanation"), ("label", None), ("textarea", None), ("p", "review-status")] * len(boxes), local)
                    exports = [attrs for tag, attrs in tags if "data-export-notes" in attrs or "data-export-atlas-notes" in attrs]
                    self.assertTrue(exports and not any("data-kernel-local" in attrs for attrs in exports))

    def test_step_ids_are_valid_and_unique_in_the_atlas(self):
        for layout in ("single", "catalog"):
            for step_id in ("Bad Step", "main", "second-story", "first-story-step-1"):
                with self.subTest(layout=layout, step_id=step_id):
                    data = copy.deepcopy(self.data)
                    data["stories"][0]["steps"].append({"id": step_id, "action": "Close", "result": "Closed"})
                    with self.assertRaises(ValueError):
                        self.render(layout, data=data)

    def test_html_and_embedded_json_remain_inert(self):
        data = copy.deepcopy(self.data)
        payload = '</script><img src=x onerror="alert(1)"> & {{TITLE}}'
        data["stories"][0]["title"] = payload
        data["stories"][0]["steps"][0]["images"][0]["caption"] = payload
        page = self.render(data=data)["index.html"].decode()
        document = Document(page)
        self.assertFalse(any("onerror" in attrs for _, attrs in document.tags))
        self.assertEqual(2, sum(tag == "script" for tag, _ in document.tags))
        self.assertIn("&lt;img", page)
        self.assertIn("{{TITLE}}", page)
        self.assertNotIn(payload, page)

    def test_recovery_images_stay_in_their_story(self):
        self.data["stories"][0]["alternatives"] = [{
            "title": "Retry after a timeout", "detail": "When the request times out, retry it.",
            "steps": [{"action": "Choose Retry", "result": "The request completes", "images": [self.image]}],
        }]
        files = self.render("catalog")
        first = Document(files["stories/first-story.html"].decode())
        second = Document(files["stories/second-story.html"].decode())
        self.assertEqual(2, sum("data-view-image" in attrs for _, attrs in first.tags))
        self.assertEqual(1, sum("data-view-image" in attrs for _, attrs in second.tags))

    def test_remote_images_are_referenced_without_download(self):
        self.data["stories"][0]["steps"][0]["images"][0]["src"] = "https://example.com/screen.png"
        files = self.render()
        self.assertIn('src="https://example.com/screen.png"', files["index.html"].decode())

    def test_rejects_unsafe_urls_and_invalid_story_ids(self):
        for url in ("javascript:alert(1)", "data:image/png;base64,eA==", "file:///private/screen.png", "https://user:pass@example.com/a", "https://example.com\\@bad.test/a"):
            with self.subTest(url=url):
                data = copy.deepcopy(self.data)
                data["stories"][0]["steps"][0]["images"][0]["src"] = url
                with self.assertRaises(ValueError):
                    self.render(data=data)
        for story_id in ("../outside", "main", "first story", "First-Story"):
            data = copy.deepcopy(self.data)
            data["stories"][0]["id"] = story_id
            with self.assertRaises(ValueError):
                self.render(data=data)

    def test_replace_requires_matching_managed_output_and_preserves_other_files(self):
        output = self.root / "out"
        files = self.render("catalog")
        write_output(files, output, "test-atlas", False)
        (output / "user-notes.txt").write_text("Keep this")
        with self.assertRaises(ValueError):
            write_output(files, output, "test-atlas", False)
        with self.assertRaises(ValueError):
            write_output(files, output, "another-atlas", True)
        single = self.render("single")
        write_output(single, output, "test-atlas", True)
        self.assertEqual("Keep this", (output / "user-notes.txt").read_text())
        self.assertFalse((output / "stories/first-story.html").exists())
        self.assertTrue((output / MANIFEST).is_file())
        self.assertEqual(single["index.html"], (output / "index.html").read_bytes())

    def test_replace_rejects_unmanaged_collision_and_symlink(self):
        output = self.root / "out"
        write_output(self.render(), output, "test-atlas", False)
        (output / "stories").mkdir()
        collision = output / "stories/first-story.html"
        collision.write_text("Unrelated content")
        before = (output / "index.html").read_bytes()
        with self.assertRaises(ValueError):
            write_output(self.render("catalog"), output, "test-atlas", True)
        self.assertEqual(before, (output / "index.html").read_bytes())
        self.assertEqual("Unrelated content", collision.read_text())
        collision.unlink()
        collision.symlink_to(self.root / "outside.html")
        with self.assertRaises(ValueError):
            write_output(self.render("catalog"), output, "test-atlas", True)
        self.assertFalse((self.root / "outside.html").exists())

    def test_invalid_input_does_not_touch_existing_output(self):
        output = self.root / "out"
        write_output(self.render(), output, "test-atlas", False)
        before = (output / "index.html").read_bytes()
        self.data["stories"][1]["steps"][0]["images"][0]["src"] = "missing.png"
        with self.assertRaises(ValueError):
            write_output(self.render(), output, "test-atlas", True)
        self.assertEqual(before, (output / "index.html").read_bytes())


if __name__ == "__main__":
    unittest.main()
