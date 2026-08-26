---
name: domain-modeling
description: Clarify a software product's canonical domain vocabulary, concepts, invariants, and boundaries by reconciling stakeholder language with current code, and document only genuinely durable architectural decisions. Use when ambiguous terminology or domain rules are impeding design or implementation, or when the user requests a glossary or ADR update; not for generic code documentation.
---

# Domain Modeling

Make domain language precise enough that people, code, and future plans refer to the same concepts without turning the glossary into a specification or an implementation catalog.

## Authorization boundary

Analyze terms and propose a model in the conversation when domain clarification supports another task. Edit or create canonical glossary, context, or ADR files only when the user explicitly requests domain-model or documentation changes.

Do not invent business rules, rename code broadly, or make an unresolved architecture choice under cover of documentation. If domain-expert input is unavailable, mark uncertain definitions and questions rather than presenting them as canonical.

## Establish the current language

Discover repository instructions and existing canonical homes such as context files, glossaries, architecture docs, ADR directories, schemas, or specifications. Reuse their structure and terminology.

Cross-check stakeholder language against the concepts expressed in current types, models, tables, events, routes, commands, tests, and user-facing copy. Note:

- one term used for several concepts;
- several terms used for one concept;
- names whose code meaning differs from the business meaning;
- hidden invariants, lifecycle states, ownership, identity, or boundary rules; and
- historical or compatibility names that cannot yet be removed.

Current code may reveal implemented behavior without making that behavior the intended domain rule. Separate observed implementation from confirmed business meaning.

## Shape the model

Define only the concepts needed to remove the ambiguity at hand. For each canonical term, capture:

- a concise domain definition;
- how it differs from commonly confused terms;
- essential invariants, relationships, and lifecycle states;
- accepted aliases or deprecated names when they aid discovery; and
- uncertainty or source authority when the definition is not settled.

Prefer the vocabulary domain participants actually use when it is precise. A glossary defines meaning; it should not prescribe screens, APIs, storage tables, implementation classes, delivery status, or future requirements. Link to those artifacts when useful instead of duplicating them.

Check that proposed entities and state transitions make invalid states visible rather than encoding them as unexplained combinations of flags. Keep bounded contexts distinct when the same word legitimately has different meanings.

## Update canonical documentation lazily

When documentation changes are authorized, update the existing canonical file and avoid creating a competing source of truth. Create the smallest new document only when no suitable canonical home exists, place it according to repository conventions, and link it from the nearest discoverable index when appropriate.

Preserve useful existing definitions and explicitly reconcile conflicts. Do not silently redefine a public or persisted term. Keep implementation examples few and clearly labeled as examples.

## ADR gate

Create an architecture decision record only when all of these are true:

1. the decision is costly or difficult to reverse;
2. a future maintainer would reasonably find it surprising without context; and
3. credible alternatives involved a real tradeoff.

Routine implementation choices, feature requirements, glossary definitions, temporary workarounds, and decisions with no meaningful alternative do not need ADRs. Do not invent or mark a decision accepted when the responsible person has not made it; use a proposal or open question instead if the repository's convention supports that state.

For a qualifying ADR, follow the repository template and capture context, decision, considered alternatives, consequences, status, and links to evidence. Explain why the rejected alternatives lost under the constraints that existed at the time, not why they are universally inferior.

## Validate and report

Search the affected code and docs for conflicting uses of changed terms. Confirm that links, ADR numbering, and status follow local conventions. Report:

- canonical terms added or changed;
- implementation observations kept separate from domain definitions;
- unresolved questions requiring domain authority;
- documents changed, if authorized; and
- ADRs created or deliberately omitted, with the gate rationale.
