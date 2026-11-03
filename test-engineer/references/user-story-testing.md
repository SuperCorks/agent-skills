# Focused user-story testing

Use this for user-facing behavior changes and journey audits. The unit of coverage is a person's completed outcome, including the transitions that connect features. Existing unit, integration, visual, and security checks remain useful; this method supplies evidence for the connected behavior they may not exercise.

## Choose stories from evidence

Start with the request, acceptance criteria, actual entry points, and relevant bug reports. When reports are available, group them by the failed transition or invariant, such as lost state after authentication, stale responses after an input changes, or customer data failing to reach staff. Deduplicate repeated reports. Treat related variants as hypotheses to test, not additional confirmed defects.

For each affected story, record a compact row or equivalent notes:

| Field | What to capture |
| --- | --- |
| Actor and goal | Who acts, and what useful result they need |
| Starting state and entry | Role/authentication, existing or fresh data, and the actual route or control used |
| Continuous path | Actions and boundaries traversed, including another surface or role when part of the outcome |
| Completion and invariants | Visible result, durable result, and data that must survive unchanged |
| Material variants | Relevant interruption, timing, invalid-state, permission, or viewport cases |
| Evidence and status | Build/environment, real versus simulated boundaries, artifacts, and pass/fail/blocked/not run |

For an extensive audit, prioritize core outcomes and the patterns in reported failures, then broaden to adjacent common patterns. For a small fix, keep this to the affected story and variants that could invalidate the fix. Do not turn the matrix into a mandatory whole-product sweep.

## Check what existing tests really prove

Read the actions and assertions, not only test names or aggregate pass counts. Identify where each test starts, what it seeds or mocks, where it stops, and what result it verifies.

- Separate tests for form submission and a pre-seeded staff record leave the handoff between them unproven.
- A redirect, toast, HTTP 200, or screenshot may prove an intermediate state without proving completion. Check the operation's actual result and, when state changes, its durable readback.
- A test that reloads and then manually reselects the product cannot prove that selection survived reload.
- Existing skips, hidden mobile controls, and provider mocks can leave whole paths unexecuted even in a green suite.

Reuse sound existing coverage. Add a focused journey where the connection is missing, rather than duplicating every component test.

## Execute the same story through completion

1. Establish the baseline on the intended build and environment. Use the repository's supported runtime and browser controls; confirm readiness and authentication before interpreting a failure.
2. Start at the user's real entry point and drive the public actions in order. Setup may seed prerequisites, but do not inject the result of the transition being tested or replace a broken UI step with an API call and still call the journey complete.
3. Carry the same record, design, order, or other state through the flow. When changing roles or surfaces, follow its identity and verify the relevant content, not merely that some record exists.
4. Verify the visible outcome plus a read-only second view of important persisted values. Reload or leave and re-enter when persistence is part of the story. Assert meaningful payloads/content, totals or quantities, ownership, and exactly-once effects where applicable.
5. Run the selected recovery and boundary variants. Capture the failing step, expected versus actual behavior, and enough UI/network/storage evidence to distinguish the defect from the harness.
6. If fixing is authorized, preserve a failing reproduction, fix the cause, and rerun the same path before the relevant broader suite. Add a durable regression when proportionate; otherwise retain a repeatable script or browser recipe with its evidence.

Keep external boundaries explicit. A real app and database with simulated OAuth or payment delivery can prove the local continuation and downstream processing, but cannot prove the live provider integration. Use safe test targets; a request to test a story does not authorize a real purchase, outbound message, or production workflow mutation. If a consequential boundary cannot be exercised, report the boundary and partial evidence instead of claiming the whole live journey passed.

## Select variants by the failure pattern

Use the relevant cases, not a blanket Cartesian product:

- **Authentication and entry points:** anonymous action → sign-in → return → original intent resumes; compare fresh and returning sessions and materially different routes exposing the same action. A shared Save control may have different readiness on a product page and an editor.
- **Timing and stale state:** delay the dependency required by the action; change or clear input while work is pending; release old responses after newer state exists. Verify both the absence of premature/stale effects and the eventual correct outcome. Prefer controlled response gates and observable readiness over arbitrary sleeps.
- **Recovery:** fail the actual operation → honest unsaved/error state → retry → durable success → refresh. Check that recovery preserves user input and does not duplicate a submission, payment, or save where duplication matters.
- **Editing and availability:** change an earlier choice after reaching review; verify dependent options, quantities, pricing, and final payload are updated or clearly invalidated. Include valid → invalid/empty → valid when that is the risky transition.
- **Multiple items and roles:** create distinct items, complete the combined flow, and verify each retains its identity and content downstream. Follow customer-created data into the staff view when that handoff is part of the story.
- **Responsive interaction:** repeat material paths where controls or navigation differ by viewport or input method. Use the controls a user can actually see; forcing a click on a hidden desktop control does not prove mobile usability.

## Isolate and diagnose failures

Own test data, browser sessions, and runtime resources. Use unique identities and clean up owned mutations in failure paths as well as success paths. When a fixture can affect later lists, prices, or screenshots, verify the relevant sequence in the shared suite, not only the test in isolation. Parallelize only independent stories with isolated resources; otherwise serialize shared state.

Classify a failure before changing anything: product behavior, test selector/expectation, environment, or leaked test data. Do not weaken assertions, update screenshot baselines, add skips, or retry the whole story merely to hide a failure. A narrowly identified infrastructure retry must not mask a product error or repeat a consequential action.

## Report the proof boundary

Record each selected story's result and evidence, the tested build/environment, and where the path was mocked, split, blocked, or not run. Distinguish source review, unit evidence, a continuous local journey, and live-provider proof. Keep skipped-case counts and reasons separate from passes; large test totals are not proof of broad user-story coverage.

A story passes only when its named outcome and material invariants were observed. If only individual steps passed, report those steps and the missing connection. A test-only task ends with findings and evidence; it does not silently become an implementation or delivery task.
