# Reviewing frontend UX and design

Use this reference for critique, accessibility review, UX audit, design QA, or the final verification pass after implementation.

## Evidence

Prefer, in order:

1. behavior observed in the running interface;
2. screenshots or recordings at named states and viewports;
3. implementation evidence from specific files and lines;
4. inference, labeled when runtime proof is unavailable.

Do not report a preference as a defect. Tie findings to task completion, accessibility, consistency, responsiveness, product intent, or an established design rule.

## Review

Establish the expected behavior, target user, incumbent design system, and scope. Inspect the changed surface beside nearby patterns. When possible, test desktop and narrow/mobile widths plus the primary pointer and keyboard paths, including focus, overlays, dismissal, validation, and state feedback. Report only evidenced findings from the gates below.

## Gates

### Usability and information architecture

- The primary task and next action are clear; hierarchy follows user importance rather than implementation structure.
- Navigation, labels, grouping, and progressive disclosure reduce avoidable cognitive load.
- Destructive actions are distinguishable and appropriately confirmed.
- Empty and error states explain what happened and what the user can do next.

### Semantics and accessibility

- Elements use correct native semantics; buttons perform actions and links navigate.
- Headings, landmarks, lists, tables, and form relationships express the visible structure.
- Controls have accessible names; instructions and errors are programmatically associated where needed.
- Keyboard users can reach, operate, and leave every interaction with visible focus and sensible focus management.
- Active overlays expose their role and name, manage focus appropriately, and support expected dismissal.
- Images have appropriate alternatives; decorative media is ignored by assistive technology.
- Color is not the only carrier of meaning, and contrast meets the project's applicable WCAG target.
- Motion respects user preferences and avoids unnecessary vestibular triggers.

### Interaction behavior

- Applicable hover, focus, active, selected, disabled, loading, success, and error states are coherent.
- Feedback prevents duplicate actions and uncertainty.
- Touch targets and spacing support coarse pointers.
- Interaction does not require hover, precise pointing, or an unexplained gesture.

### Responsive behavior

- Content reflows without clipping, accidental horizontal scrolling, collision, or unreadable wrapping.
- Critical actions remain available as space contracts.
- Text zoom, long labels, localization, empty data, and dense content do not break the layout.
- Fixed, sticky, and viewport-height elements tolerate mobile browser chrome and on-screen keyboards.

### Alignment and spacing

- Each relationship has an intentional edge, centerline, or baseline; centering is used where appropriate rather than applied indiscriminately.
- Labels, icons, images, badges, and inputs align on the intended visual axis. Button labels and icon-label groups are optically centered horizontally and vertically within their controls.
- Equivalent controls and repeated components use consistent dimensions, padding, grid lines, and gaps without one- or two-pixel drift from line-height, icon bounds, or intrinsic image whitespace.
- Spacing expresses grouping: items within a component sit closer than distinct components, and larger structural gaps separate groups and sections consistently.
- Section titles have deliberate separation from their content, and adjacent components neither touch accidentally nor create unexplained dead space.
- Alignment and spacing survive wrapping, text zoom, long or localized labels, image loading, and responsive reflow.

### Visual system and craft

- Typography, spacing, color, radii, iconography, imagery, and motion form a coherent hierarchy and use established tokens.
- Equivalent components remain consistent across states.
- Decoration clarifies rather than obscures content or interaction.
- The result feels specific to the product rather than assembled from unrelated template defaults.
- Refinements preserve established identity unless redesign was in scope.

### Content and trust

- Copy is specific, consistent, and written from the user's perspective.
- Controls, confirmations, errors, and notifications reuse the same action vocabulary.
- Claims, metrics, testimonials, customer marks, and examples are sourced rather than invented.
- Truncation, wrapping, units, dates, numbers, and status language remain understandable.

### Performance and implementation risk

- New visual behavior avoids obvious layout shift, avoidable render churn, blocking assets, and excessive animation work.
- New dependencies are justified and compatible with the stack.
- Console errors, failed resources, and hydration problems are blockers when they affect the reviewed flow.

## Severity and verdict

- **Blocker:** prevents task completion, causes data loss, breaks a primary interaction, creates a serious accessibility barrier, or makes the result materially unusable at a supported viewport.
- **Major:** meaningfully harms comprehension, efficiency, consistency, responsiveness, or accessibility but has a workaround.
- **Suggestion:** a supported improvement whose absence does not make the change unsafe or unusable.

Return `needs changes` when any blocker remains. Use judgment for major findings: return `needs changes` when they make the requested outcome incomplete; otherwise return `pass` and list them as non-blocking follow-ups.

## Output contract

Start with exactly one verdict:

`Verdict: pass`

or

`Verdict: needs changes`

Then report blockers first. Each finding must include the observed problem and state or viewport, the violated criterion, evidence (preferably `file:line` plus runtime observation), and a concrete fix. Separate major findings and suggestions. If no findings remain, state what was verified instead of inventing polish work.
