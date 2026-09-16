# Build or update a voice profile

Read this guide for setup or an intentional profile update. Normal drafting only needs the existing profile and the skill entrypoint.

## Agree on inputs

Start with information already provided. When setup has not been authorized, propose it before collecting samples. Ask which sources the user chooses: pasted writing, selected files, connected account history, or a mixture. There is no requirement to connect an account.

Confirm the selected accounts or workspaces and intended scope before accessing external history, unless that scope is already authorized in the conversation. Resolve account identity with read-only tools; deduplicate aliases that point to the same mailbox. Being signed in does not authorize reading every available account. Use an available connector or relevant installed source skill; this skill has no required provider or hard-coded credential paths.

Establish the intended writing uses, languages, and desired editing tolerance. Useful choices are faithful everyday phrasing, light editing, and a more polished register. Let the user choose; do not infer that all users want the same outcome. Ask about AI-assisted or ghostwritten material when it could materially skew the sample.

For account history without a requested date range, propose a bounded recent sample, such as the past year. Include older writing when the user authorizes it and it helps establish a baseline. Do not silently expand into additional accounts, private channels, inboxes, attachments, or earlier periods beyond the agreed scope.

If a source is unavailable, report the gap and offer pasted examples or another source the user selects. Do not start credential renewal or request broader permissions merely to draft. An explicitly accepted partial sample can produce a provisional profile; missing sources are a limitation, not evidence that no writing exists.

## Sample and identify the author's text

Prefer a varied sample over a complete archive. Cover distinct dates, recipients, languages, media, and situations: quick replies, requests, explanations, follow-ups, disagreement, and warmth. Seek more examples where those distinctions are unclear. Avoid letting one busy channel, long thread, or repeated email template determine the voice.

- Verify which messages were written by the user. A shared mailbox, send-as identity, or Sent label does not by itself establish human authorship. Keep mailbox provenance separate from the sender identity; a sent copy in one mailbox does not prove full access to another.
- In email, select one MIME representation, preserve useful paragraph breaks, and remove quoted reply chains, forwarded material, signatures, disclaimers, and duplicated plain-text/HTML content. Handle multiline and non-English quotation boundaries; inspect ambiguous inline replies rather than cutting away the author's answers.
- In conversations, separate the user's words from other participants, quoted material, automated notices, commands, code, and pasted reports. Read only the context needed within the approved scope. Exclude link-only posts from linguistic analysis.
- Deduplicate identical and near-identical templates. Retain short acknowledgments as evidence of brevity, but do not let them overwhelm substantive examples.
- Treat uncertain authorship separately. Prefer corroborated writing when the user wants their own voice. Age, polish, punctuation, or an AI detector alone cannot establish authorship. Earlier writing can also contain templates.

Retrieved message totals describe the sample collected, not the number of verified original examples analyzed. Record that distinction. Do not claim exhaustive coverage or a measured accuracy score from a convenience sample.

## Infer useful, contextual guidance

Describe observable writing choices, not personality diagnoses. Distinguish vocabulary and rhythm from the subjects the user happens to discuss. A project name, profession, repeated invoice, or signature is not a core voice trait.

Look for recurring patterns in openings, directness, sentence length, paragraphing, requests, hedging, explanations, disagreement, closings, punctuation, shorthand, and humor. For each useful inference, record supporting observations and where it applies. Label a tentative inference instead of turning a single example into a rule. When evidence differs by language, medium, or recipient relationship, preserve that difference rather than averaging it away.

Keep explicit user preferences separate from observations. Follow the chosen editing tolerance: correcting an accidental typo need not erase fragments, contractions, or natural informal phrasing. An unsupported genre or language should inherit only the supported general traits.

## Write one personal file

Use `voice.local.md` beside the active skill as the canonical profile unless the user has designated an existing profile there via symlink. Keep it readable Markdown with these fields and sections; no parser or rigid schema is required:

| Section | Contents |
| --- | --- |
| Identity and status | Owner, created/updated dates, languages, intended uses, provisional or calibrated status. |
| Explicit preferences | User-stated editing tolerance, continuing preferences, and corrections. |
| Voice observations | A small set of recurring traits, supporting evidence, confidence, and context-specific exceptions. |
| Context and language | Guidance for supported media, relationships, languages, and longer explanations. |
| Examples | Short anonymized excerpts or adaptations, labeled with situation, language, and the choice they illustrate. |
| Coverage and provenance | Sources/accounts sampled, periods, retrieved totals when known, authorship limitations, missing sources, and a few source identifiers for future maintenance. |

Use the minimum personal information necessary to preserve style. Remove credentials, private addresses, business identifiers, financial or health details, and third-party names from examples. Mark paraphrases and fictionalized situations as adaptations; do not label them verbatim evidence. Keep identifiers only where they help trace a representative source. Do not retain a raw archive or embed attachment contents in the profile.

The public skill and research references remain generic. Do not put an individual's traits, examples, source links, or identifiers in the shared instructions, repository listing, validation output intended for publication, or PR description.

Before writing in a Git checkout, verify that the skill's ignore rule applies and that the profile path is not tracked:

```sh
# Run inside the active skill directory.
git check-ignore --no-index -v -- voice.local.md
git ls-files --error-unmatch -- voice.local.md
```

The first command should identify an ignore rule; the second should report that the path is not tracked. If it is already tracked, do not overwrite it with personal data. Explain the conflict and use an installation where `voice.local.md` is ignored and untracked, or resolve tracking with the user's authorization. Do not silently switch filenames that the drafting workflow cannot find, remove a tracked file, or rewrite Git history as an incidental setup step. Outside a Git checkout, preserve the bundled ignore file for later use; Git verification is inapplicable.

For a profile symlink, check both the link in the installation and the canonical target if either belongs to a Git checkout. Keep the ignore rule in place before creating the profile or any same-prefix temporary files. Use owner-only file permissions where supported. Preserve any existing file or symlink rather than replacing a destination without checking it.

When installing elsewhere, explain that ignored profiles do not travel with Git. A local copy is independent; a symlink shares future changes and requires the canonical target to remain available. Do not commit either a personal profile or its link. No installer changes or global Git configuration are needed.

## Calibrate and maintain

Show a few short drafts across the supported languages and situations, using supplied facts or clearly fictional scenarios. Ask whether the tone feels too formal, terse, wordy, or otherwise unlike the user. Setup authorization is sufficient to save a provisional profile; feedback can refine it afterward, so an unanswered optional calibration question need not block an already requested draft.

Check that drafts preserve meaning, fit the recipient, and avoid forced catchphrases. Record actual user feedback as explicit preferences. Do not claim that self-review or a generated example demonstrates the user's approval or proves authorship accuracy.

For an update, keep supported guidance, make the requested change, and refresh the update date and relevant provenance. Do not resample accounts unless the user asks for that work or has already authorized it in the current scope. One draft's requested edit remains local unless the user expresses a continuing preference. Generated drafts are not fresh evidence of how the user naturally writes.

## Research basis

An explicit style guide with selected examples is a practical design choice, not a guarantee of imitation quality. [Author Writing Sheet research](https://aclanthology.org/2025.ijcnlp-long.82/) found benefits from structured author profiles in story generation; applying that idea to correspondence is an adaptation. [Everyday-author evaluation](https://aclanthology.org/2025.findings-emnlp.532/) reports limitations in reproducing subtle personal style from examples. Validate the profile through the user's feedback instead of treating those findings as proof that a particular profile works.
