# Feedback-round report

The report records one Pastel feedback round: what each comment asked, what changed, and before and after screenshots of the element it points at. It is an `html-report-builder` findings report, so Kernel hosts it like any other report: comments and answers stay on their blocks across versions, and the brand kit applies. `build-report.mjs` writes it from the review folder; [../assets/feedback-report.html](../assets/feedback-report.html) is the same structure as a hand-editable template.

## Review folder

```
review/
  comments.json        read-comments.js --status active,in-progress,in-review
  media/               download-media.js: <n>-pastel.jpg, <n>-attachment-1.png, media.json
  before/              capture.mjs --label before: <n>.jpg, capture.json
  after/               capture.mjs --label after: <n>.jpg, capture.json
  targets.json         capture overrides (optional)
  sign-in.mjs          capture --setup module (optional)
  changes.json         written during the round (below)
```

Keep it outside the repository; the Kernel attachment is the lasting copy. Commit the report only when the user asks.

## changes.json

```json
{
  "title": "Guest portal feedback, October 20",
  "lede": "All eight open comments are handled in [account-web#82](https://github.com/OWNER/REPO/pull/82): seven changed and one was already live.",
  "canvasName": "Guest account",
  "canvasUrl": "https://usepastel.com/link/SLUG/",
  "version": "2.0",
  "reviewer": "Leslie Primack",
  "audience": "internal",
  "beforeSource": "local build of staging (fixture data), October 20",
  "afterSource": "local build of feat/guest-portal-polish (fixture data), October 20",
  "links": [
    { "kind": "Pull request", "label": "account-web#82", "url": "https://github.com/OWNER/REPO/pull/82" },
    { "kind": "Task", "label": "NF-28", "url": "https://app.krnl.work/t/NF-28" }
  ],
  "decisions": [
    {
      "question": "How should the portal send newsletter signups, given the main site's form rejects cross-origin posts?",
      "context": "Optional: what it affected.",
      "recommendation": "A portal route that forwards to the same Akia form.",
      "answer": "Portal route to the same Akia form",
      "by": "Simon"
    }
  ],
  "comments": [
    {
      "number": 38,
      "title": "Green and red status badges",
      "outcome": "changed",
      "change": "Confirmed stays are light green with dark green text, cancelled stays light red.",
      "files": ["src/components/stay-list.tsx", "src/app/globals.css"],
      "note": "The fixture stay is confirmed, so the after shot shows the green badge only."
    },
    { "number": 40, "outcome": "changed", "change": "…", "before": false, "after": false, "note": "Browser tab titles are not part of the page." },
    { "number": 22, "outcome": "already-done", "change": "Already live: outline buttons fill black on hover." }
  ],
  "next": ["Review and merge account-web#82, then check it on staging"],
  "verification": ["Unit and Playwright suites pass on the branch"]
}
```

- `comments` sets the report's order and which comments appear. The comment text, author, date, Pastel link, and page come from `comments.json`.
- `outcome` is one of:

  | Outcome | Pill | Use when |
  | --- | --- | --- |
  | `changed` | green, Changed | The request is done in this round |
  | `already-done` | blue, Already done | It already worked; say where |
  | `partial` | amber, Partly changed | Some of it is done; say what is left |
  | `needs-decision` | amber, Needs a decision | Waiting on someone; say who |
  | `not-changed` | grey, Not changed | Deliberately not done; say why |

- `change` reads as "Change:" for `changed` and `partial`, otherwise as "Response:". Text fields accept `` `code` ``, `**bold**`, and `[label](https://…)`.
- `before` or `after` set to `false` drops that screenshot, for requests a page screenshot cannot show (browser tab titles, emails). Say why in `note`.
- `pastelStatus` (top level or per comment) adds an "In review in Pastel"-style pill. Set it only when you know the current status; the status in `comments.json` is from the start of the round.
- `audience: "client"` drops file chips, notes, links, and verification. Follow `html-report-builder`'s client writing rules for the rest.

## Building

```bash
node $PASTEL/scripts/build-report.mjs --dir review --out <dir>/<date>-<slug>-feedback.html --build --brand kit.json
```

- The script copies every image into `<slug>.assets/`. On macOS it shrinks images wider than 1600 px or over 300 KB to JPEG, so the built report stays under about 2 MB. `--build` then runs `html-report-builder`'s `report.mjs build`, which inlines the images, refreshes the runtime and table of contents, and validates.
- Expected warning: `findings template sections missing: #recommendation`. A feedback round has no recommendation section.
- Screenshot warnings from `capture.json` (an element not found, or a selector match far from the click) are listed in the Method section. Fix them with `targets.json` and re-capture rather than shipping them.
- For a Kernel task, read `GET /api/v1/tasks/{taskId}/brand-kit` with the `kernel` skill, save it as JSON, and pass `--brand`.

## Editing by hand

After building, revise the HTML like any `html-report-builder` report: run its `outline` first, keep every id (`c<number>` for each comment card, `q1`, `q2`, … for decisions), use only its documented classes, and rebuild. Re-running `build-report.mjs` overwrites the file, so either edit `changes.json` and regenerate, or edit the HTML and stop regenerating.

The components the report uses are all from `html-report-builder` (`references/components.md` there):

| Part | Component |
| --- | --- |
| Counts | `.tiles` with `.tile` (`ok`, `warn`) |
| Index | `.table-wrap` table; outcome cell tones `ok`, `info`, `warn` |
| Decisions | `.question` with `.rec` and a filled `.answer` |
| Comment cards | `.grid` of `article.card.wide`, `.pill`, `.callout` for the comment, `.shots` or `figure` for the reviewer's images, `.chips` for files, `.compare` with `figure.before` and `figure.after` |
| Next steps | `ol.checklist` |
| Method | paragraph, list, `.callout.warn` for screenshot warnings |

## Attaching to Kernel

Export with `report.mjs export <report.html> --out <dir>`. Upload `<slug>.html` as a task attachment and each file in `<slug>.assets/` as a supporting file at its relative path, through the `kernel` skill. Then read the attachment's checks. A later revision is a new version of the same attachment.
