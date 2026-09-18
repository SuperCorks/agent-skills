#!/usr/bin/env python3
"""Render a static User Journey Atlas. Python standard library only."""

import argparse
import hashlib
import html
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


ASSETS = Path(__file__).resolve().parent.parent / "assets"
MANIFEST = ".atlas-manifest.json"
ID_PATTERN = re.compile(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)*\Z")
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}
RESERVED_IDS = {"main", "personas", "stories", "sources", "viewer-title", "viewer-caption"}


def text(value, context, required=False):
    if not isinstance(value, str) or (required and not value.strip()):
        raise ValueError(f"{context} must be {'a nonempty' if required else 'a'} string")
    return value


def esc(value):
    return html.escape(value, quote=True)


def identifier(value, context):
    value = text(value, context, True)
    if not ID_PATTERN.fullmatch(value) or len(value) > 100 or value in RESERVED_IDS:
        raise ValueError(f"{context} must be a stable lowercase hyphenated identifier (for example, manage-booking)")
    return value


def objects(value, context):
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError(f"{context} must be an array of objects")
    return value


def strings(value, context):
    if not isinstance(value, list):
        raise ValueError(f"{context} must be an array of strings")
    return [text(item, context, True) for item in value]


def web_url(value, context):
    value = text(value, context, True)
    if value != value.strip() or any(ord(char) < 32 for char in value) or "\\" in value:
        raise ValueError(f"{context} must be a plain HTTP(S) URL")
    parsed = urlsplit(value)
    if parsed.scheme.lower() not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError(f"{context} must be an HTTP(S) URL without embedded credentials")
    return value


def paragraph(value, class_name=""):
    attr = f' class="{class_name}"' if class_name else ""
    # Preserve intentional line breaks without interpreting Markdown or HTML.
    return f"<p{attr}>" + esc(value).replace("\n", "<br>") + "</p>"


def list_html(values):
    return "<ul>" + "".join(f"<li>{esc(value)}</li>" for value in values) + "</ul>"


class Renderer:
    def __init__(self, data, input_dir, layout, review_notes):
        if not isinstance(data, dict):
            raise ValueError("The JSON root must be an object")
        self.data = data
        self.input_dir = input_dir
        self.layout = layout
        self.review_notes = review_notes
        self.atlas_id = identifier(data.get("id"), "id")
        self.title = text(data.get("title"), "title", True)
        self.summary = text(data.get("summary", ""), "summary")
        self.personas = objects(data.get("personas"), "personas")
        self.persona_names = {}
        for persona in self.personas:
            key = identifier(persona.get("id"), "persona.id")
            if key in self.persona_names:
                raise ValueError(f"Duplicate persona ID: {key}")
            self.persona_names[key] = text(persona.get("name"), "persona.name", True)
            text(persona.get("description"), "persona.description", True)
        self.stories = objects(data.get("stories"), "stories")
        if not self.stories:
            raise ValueError("stories must contain at least one story")
        story_ids = set()
        for story in self.stories:
            key = identifier(story.get("id"), "story.id")
            if key in story_ids:
                raise ValueError(f"Duplicate story ID: {key}")
            story_ids.add(key)
            text(story.get("title"), f"{key}.title", True)
            if story.get("persona") not in self.persona_names:
                raise ValueError(f"{key}.persona must name one of the persona IDs")
        self.files = {}
        self.image_names = {}

    def add_file(self, relative, content):
        self.files[relative] = content.encode("utf-8") if isinstance(content, str) else content

    def image_source(self, value, prefix):
        value = text(value, "image.src", True)
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc:
            return web_url(value, "image.src")
        if any(ord(char) < 32 for char in value) or "?" in value or "#" in value:
            raise ValueError("Local image.src must be a filesystem path, without a query or fragment")
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = self.input_dir / path
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            raise ValueError(f"Unsupported image type: {path.name}; use a raster screenshot")
        try:
            content = path.read_bytes()
        except OSError as error:
            raise ValueError(f"Cannot read image {path}: {error.strerror}") from error
        if not content:
            raise ValueError(f"Image is empty: {path}")
        digest = hashlib.sha256(content).hexdigest()
        if digest not in self.image_names:
            extension = ".jpg" if path.suffix.lower() == ".jpeg" else path.suffix.lower()
            relative = f"images/{digest}{extension}"
            self.image_names[digest] = relative
            self.add_file(relative, content)
        return prefix + self.image_names[digest]

    def source_items(self, entries, context):
        rendered = []
        for source in objects(entries, context):
            label = esc(text(source.get("label"), f"{context}.label", True))
            if "url" in source:
                url = web_url(source["url"], f"{context}.url")
                label = f'<a href="{esc(url)}" rel="noreferrer">{label}</a>'
            if source.get("note"):
                label += " — " + esc(text(source["note"], f"{context}.note"))
            rendered.append(f"<li>{label}</li>")
        return "".join(rendered)

    def sources(self, stories):
        entries = self.source_items(self.data.get("sources", []), "sources")
        for story in stories:
            story_entries = self.source_items(story.get("sources", []), "story.sources")
            if story_entries:
                entries += f'<li>{esc(story["title"])}<ol>{story_entries}</ol></li>'
        return (f'<footer class="source-footer" id="sources"><h2>Sources</h2><ol>{entries}</ol></footer>'
                if entries else "")

    def persona_section(self, persona_ids=None):
        entries = ""
        for persona in self.personas:
            if persona_ids is None or persona["id"] in persona_ids:
                entries += f'<dt>{esc(persona["name"])}</dt><dd>{esc(persona["description"])}</dd>'
        return f'<section class="personas" id="personas"><h2>Personas</h2><dl>{entries}</dl></section>'

    def story_link(self, story):
        return f'stories/{story["id"]}.html' if self.layout == "catalog" else f'#{story["id"]}'

    def story_index(self):
        # Optional feature labels group stories in first-seen order without a dashboard.
        groups = {}
        for story in self.stories:
            feature = text(story.get("feature", ""), "story.feature")
            groups.setdefault(feature, []).append(story)
        content = '<nav class="story-index" id="stories" aria-label="User stories"><h2>Stories</h2>'
        for feature, stories in groups.items():
            if feature:
                content += f"<h3>{esc(feature)}</h3>"
            content += "<ul>"
            for story in stories:
                purpose = text(story.get("purpose"), f'{story["id"]}.purpose', True)
                content += (f'<li><a href="{self.story_link(story)}">{esc(story["title"])}</a>'
                            + paragraph(purpose) + "</li>")
            content += "</ul>"
        return content + "</nav>"

    def render_steps(self, steps, key, prefix, heading_level=3):
        steps = objects(steps, f"{key}.steps")
        if not steps:
            raise ValueError(f"{key}.steps must contain at least one action")
        content = '<ol class="steps">'
        for step in steps:
            action = text(step.get("action"), f"{key}.step.action", True)
            result = text(step.get("result"), f"{key}.step.result", True)
            content += f'<li class="step"><div class="step-copy"><h{heading_level} class="step-heading">{esc(action)}</h{heading_level}>' + paragraph(result, "step-result") + "</div>"
            screenshots = objects(step.get("images", []), f"{key}.step.images")
            if screenshots:
                content += '<div class="screenshots">'
                for screenshot in screenshots:
                    src = self.image_source(screenshot.get("src"), prefix)
                    caption = text(screenshot.get("caption"), "image.caption", True)
                    alt = text(screenshot.get("alt"), "image.alt", True)
                    content += (f'<figure><button class="screenshot-open" type="button" data-view-image '
                                f'data-full-src="{esc(src)}" data-caption="{esc(caption)}" '
                                f'aria-label="{esc("Enlarge image: " + caption)}">'
                                f'<img src="{esc(src)}" alt="{esc(alt)}" loading="lazy" decoding="async"></button>'
                                f'<figcaption>{esc(caption)}</figcaption></figure>')
                content += "</div>"
            content += "</li>"
        return content + "</ol>"

    def render_story(self, story, prefix):
        key = story["id"]
        title = story["title"]
        purpose = text(story.get("purpose"), f"{key}.purpose", True)
        trigger = text(story.get("trigger"), f"{key}.trigger", True)
        preconditions = strings(story.get("preconditions"), f"{key}.preconditions")
        outcome = text(story.get("outcome"), f"{key}.outcome", True)
        content = (f'<article class="story" id="{key}" data-story-id="{key}" data-story-title="{esc(title)}">'
                   f'<h2 class="story-heading">{esc(title)}</h2><span class="story-id">{key}</span>'
                   + paragraph("Persona: " + self.persona_names[story["persona"]], "story-persona")
                   + paragraph(purpose, "story-summary"))
        content += '<dl class="story-details"><dt>Prerequisites</dt><dd>'
        content += list_html(preconditions) if preconditions else "No additional prerequisites."
        content += f"</dd><dt>Trigger</dt><dd>{esc(trigger)}</dd></dl>"
        content += self.render_steps(story.get("steps"), key, prefix)
        content += '<section class="story-section"><h3>Outcome</h3>' + paragraph(outcome) + "</section>"
        rules = strings(story.get("rules", []), f"{key}.rules")
        if rules:
            content += '<section class="story-section"><h3>Business rules</h3>' + list_html(rules) + "</section>"
        alternatives = objects(story.get("alternatives", []), f"{key}.alternatives")
        if alternatives:
            content += '<section class="story-section"><h3>Alternative and recovery paths</h3>'
            for path in alternatives:
                content += f'<h4>{esc(text(path.get("title"), "alternative.title", True))}</h4>'
                content += paragraph(text(path.get("detail"), "alternative.detail", True))
                if "steps" in path:
                    content += self.render_steps(path["steps"], key, prefix, heading_level=5)
            content += "</section>"
        platforms = objects(story.get("platforms", []), f"{key}.platforms")
        if platforms:
            content += '<section class="story-section"><h3>Platform differences</h3><dl>'
            for platform in platforms:
                content += f'<dt>{esc(text(platform.get("name"), "platform.name", True))}</dt>'
                content += f'<dd>{esc(text(platform.get("detail"), "platform.detail", True))}</dd>'
            content += "</dl></section>"
        evidence = objects(story.get("evidence", []), f"{key}.evidence")
        if evidence:
            content += '<section class="story-section"><h3>Evidence</h3><ul>'
            for item in evidence:
                status = item.get("status")
                if status not in {"observed", "unverified"}:
                    raise ValueError("evidence.status must be observed or unverified")
                detail = text(item.get("detail"), "evidence.detail", True)
                content += f'<li><span class="evidence-label">{status.capitalize()}:</span> {esc(detail)}</li>'
            content += "</ul></section>"
        opportunities = strings(story.get("opportunities", []), f"{key}.opportunities")
        if opportunities:
            content += '<section class="story-section"><h3>UX opportunities · proposed</h3>' + list_html(opportunities) + "</section>"
        if self.review_notes == "yes":
            content += (f'<section class="review-notes" aria-labelledby="__atlas-notes-heading-{key}">'
                        f'<h3 id="__atlas-notes-heading-{key}">Review notes</h3>'
                        '<p class="review-explanation">Notes are private to this browser and origin. They are not shared or synchronized. '
                        'Export a copy to keep or share them.</p>'
                        f'<label for="__atlas-notes-{key}">Notes for this story</label>'
                        f'<textarea id="__atlas-notes-{key}" rows="4"></textarea>'
                        '<div class="review-tools"><button type="button" data-export-notes>Export Markdown</button>'
                        '<p class="review-status" role="status"></p></div>'
                        '<noscript><p>JavaScript is required to save and export notes. Copy any notes before leaving.</p></noscript></section>')
        return content + "</article>"

    def page(self, page_title, header, content, sources, prefix=""):
        if self.review_notes == "yes":
            content += ('<section class="atlas-review" aria-label="Export review notes">'
                        '<p>Export notes for this atlas, including notes saved on its other story pages in this browser.</p>'
                        '<button type="button" data-export-atlas-notes>Export atlas notes</button>'
                        '<p class="atlas-review-status" role="status"></p></section>')
        catalog = json.dumps([{"id": story["id"], "title": story["title"]} for story in self.stories])
        # Keep JSON inert even if a title contains a closing script tag.
        catalog = catalog.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")
        substitutions = {
            "TITLE": esc(page_title), "PREFIX": prefix, "ATLAS_ID": self.atlas_id,
            "REVIEW_NOTES": self.review_notes, "HEADER": header, "CONTENT": content, "SOURCES": sources,
            "STORY_CATALOG": catalog,
        }
        template = (ASSETS / "page.html").read_text(encoding="utf-8")
        # One substitution pass: content containing a template token stays literal.
        return re.sub(r"\{\{([A-Z_]+)\}\}", lambda match: substitutions[match.group(1)], template)

    def build(self):
        for name in ("atlas.css", "atlas.js"):
            self.add_file(f"assets/{name}", (ASSETS / name).read_bytes())
        header = '<p class="eyebrow">User journey atlas</p>' + f"<h1>{esc(self.title)}</h1>"
        if self.summary:
            header += paragraph(self.summary, "lede prose")
        content = self.persona_section() + self.story_index()
        if self.layout == "single":
            content += "".join(self.render_story(story, "") for story in self.stories)
            sources = self.sources(self.stories)
        else:
            sources = self.sources([])
            for index, story in enumerate(self.stories):
                story_header = (f'<p class="eyebrow"><a href="../index.html">{esc(self.title)}</a></p>'
                                f'<h1>{esc(story["title"])}</h1>')
                story_content = self.persona_section({story["persona"]}) + self.render_story(story, "../")
                story_content += '<nav class="page-navigation" aria-label="Story pages"><a href="../index.html#stories">All stories</a>'
                if index > 0:
                    prior = self.stories[index - 1]
                    story_content += f'<a href="{prior["id"]}.html">← {esc(prior["title"])}</a>'
                if index + 1 < len(self.stories):
                    following = self.stories[index + 1]
                    story_content += f'<a href="{following["id"]}.html">{esc(following["title"])} →</a>'
                story_content += "</nav>"
                self.add_file(f'stories/{story["id"]}.html', self.page(
                    f'{story["title"]} · {self.title}', story_header, story_content, self.sources([story]), "../"))
        self.add_file("index.html", self.page(self.title, header, content, sources))
        return self.files


def managed_path(relative):
    """Manifest filenames are generated output only, never arbitrary filesystem paths."""
    return (relative in {"index.html", "assets/atlas.css", "assets/atlas.js"}
            or bool(re.fullmatch(r"stories/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.html", relative))
            or bool(re.fullmatch(r"images/[a-f0-9]{64}\.(?:png|jpg|webp|gif|avif)", relative)))


def reject_symlinks(root, relative):
    current = root
    if root.is_symlink():
        raise ValueError(f"Output must not be a symlink: {root}")
    parts = Path(relative).parts
    for index, part in enumerate(parts):
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing to write through an output symlink: {current}")
        if index < len(parts) - 1 and current.exists() and not current.is_dir():
            raise ValueError(f"Output parent is not a directory: {current}")


def write_output(files, output, atlas_id, replace):
    output = output.expanduser().absolute()
    if output.is_symlink() or (output.exists() and not output.is_dir()):
        raise ValueError("--output must be a directory, not a file or symlink")
    previous_files = set()
    marker = output / MANIFEST
    if output.exists() and any(output.iterdir()):
        if not replace:
            raise ValueError("Output is not empty. Use a new directory, or --replace for an atlas previously built here")
        reject_symlinks(output, MANIFEST)
        try:
            previous = json.loads(marker.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError("--replace requires an existing renderer-managed atlas directory") from error
        if (not isinstance(previous, dict) or previous.get("atlas_id") != atlas_id
                or previous.get("generator") != "user-journey-atlas/v1"
                or not isinstance(previous.get("files"), list)
                or any(not isinstance(name, str) or not managed_path(name) for name in previous["files"])):
            raise ValueError("Output manifest is invalid or belongs to a different atlas ID")
        previous_files = set(previous["files"])
    for name in previous_files | set(files):
        reject_symlinks(output, name)
        target = output / name
        if target.exists() and (name not in previous_files or not target.is_file()):
            raise ValueError(f"Refusing to overwrite an unmanaged path: {target}")
    # Complete validation and rendering before touching the destination.
    with tempfile.TemporaryDirectory(prefix="journey-atlas-") as temporary:
        staging = Path(temporary)
        for name, content in files.items():
            staged = staging / name
            staged.parent.mkdir(parents=True, exist_ok=True)
            staged.write_bytes(content)
        manifest = {"generator": "user-journey-atlas/v1", "atlas_id": atlas_id, "files": sorted(files)}
        output.mkdir(parents=True, exist_ok=True)
        for name in files:
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(staging / name, target)
        for obsolete in previous_files - set(files):
            (output / obsolete).unlink(missing_ok=True)
        marker.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="JSON content model; local image paths are relative to this file")
    parser.add_argument("--output", type=Path, required=True, help="Artifact directory")
    parser.add_argument("--layout", choices=("single", "catalog"), default="single")
    parser.add_argument("--review-notes", choices=("yes", "no"), default="no")
    parser.add_argument("--replace", action="store_true", help="Replace only files managed by an existing atlas with the same ID")
    args = parser.parse_args()
    try:
        data = json.loads(args.input.read_text(encoding="utf-8"))
        renderer = Renderer(data, args.input.resolve().parent, args.layout, args.review_notes)
        output = write_output(renderer.build(), args.output, renderer.atlas_id, args.replace)
    except (OSError, ValueError, TypeError) as error:
        print(f"Atlas build failed: {error}", file=sys.stderr)
        return 1
    print(f"Built {args.layout} atlas: {output / 'index.html'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
