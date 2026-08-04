---
name: publish-artifacts
description: Publish generated HTML plans, PDFs, documents, images, directories, and other artifacts to Simon's existing public Google Cloud Storage bucket and return verified public URLs. Use when the user asks to upload, host, publish, share, or make an artifact publicly viewable through personal GCS storage, especially outputs from html-plan or other artifact-generation skills.
---

# Publish Artifacts

Publish finished artifacts with the bundled `scripts/publish.py` uploader. It targets Simon's existing public bucket, authenticates through the `sim` gswitch profile, preserves MIME types, prevents overwrites by default, and verifies every uploaded file anonymously.

## Safety Rules

- Treat every uploaded object as public to anyone who has or discovers its URL.
- Never upload credentials, private keys, `.env` files, browser data, cloud configuration, or an ambiguously scoped directory.
- Inspect the source list before upload. For a directory, include all files needed by relative HTML links and exclude unrelated or sensitive files.
- Treat an explicit request to upload, publish, host, republish, or update named documents or artifacts as authorization for the live public upload, ordinary Google Cloud storage/egress charges, and any required overwrite. Do not ask for a separate confirmation.
- The fixed bucket has object version history. When a requested destination already exists, use `--overwrite` without asking again; report the replacement and verified versioned URL after completion. Cached copies may remain temporarily available.
- Ask before uploading only when the user has not requested a live upload, the source scope is ambiguous, the material appears sensitive or unintended for public access, or the operation expands materially beyond the named artifacts.

## Workflow

1. Finish generating and validating the artifact with the relevant skill. For an HTML plan, follow the `html-plan` skill first.
2. Select a clear destination prefix. Use one of these conventions unless the user names a destination:
   - `plans/YYYY-MM-DD/<slug>/` for HTML plans
   - `documents/YYYY-MM-DD/` for PDFs and documents
   - `artifacts/YYYY-MM-DD/` for other generated files
   - `projects/<project-name>/` for durable project material
3. Dry-run the upload and inspect every local-to-object mapping:

```bash
python3 /Users/simon/.agents/skills/publish-artifacts/scripts/publish.py \
  /absolute/path/to/artifact \
  --folder plans/2026-07-20 \
  --dry-run
```

4. Inspect the dry-run mappings, file count, and total size. If the user explicitly requested the upload, continue directly without pausing for confirmation. If an object already exists in the fixed versioned bucket, add `--overwrite`.
5. Run the live upload with `--confirm-public` and `--overwrite` when required:

```bash
python3 /Users/simon/.agents/skills/publish-artifacts/scripts/publish.py \
  /absolute/path/to/artifact \
  --folder plans/2026-07-20 \
  --confirm-public
```

6. Return the primary public URL, mention anonymous verification, and include other URLs only when useful. For a directory containing `index.html`, report its URL first.

## Upload Behavior

- A file becomes `<folder>/<filename>` unless `--name` changes the filename.
- A directory becomes `<folder>/<directory-name>/...`; `--name` changes the uploaded root directory name.
- Relative links work when the whole artifact directory is uploaded.
- Existing objects cause the operation to stop unless `--overwrite` is supplied. For this fixed versioned bucket, use `--overwrite` automatically when fulfilling an explicit upload, update, or republish request.
- Text and web files use `no-cache`; other assets use a short public cache lifetime. Returned links include a content-hash query parameter so replaced files can be opened without a stale cache.
- Use `--json` when another tool needs structured output.

## Fixed Destination

- Account profile: `sim` (`simoncorcos.ing@gmail.com`)
- Project: `my-project-1478832460965`
- Bucket: `simon-personal-files-1478832460965`
- Public base: `https://simon-personal-files-1478832460965.storage.googleapis.com/`

Do not create buckets, alter bucket IAM, or change the active global gcloud account as part of this workflow.
