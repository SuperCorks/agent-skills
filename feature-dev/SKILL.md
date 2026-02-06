---
name: feature-dev
description: A 7-phase standard workflow for robust feature development, from discovery to shipping.
---

# Feature Development Workflow

This standard operating procedure ensures consistent, high-quality feature delivery.

## Phase 1: Discovery
**Goal**: Understand WHAT is being built and WHY.
**Actions**:
*   Read the user request thoroughly.
*   Identify the core problem and user intent.
*   List technical constraints.

## Phase 2: Codebase Exploration
**Goal**: Understand WHERE changes are needed.
**Actions**:
*   Use `Codebase Explorer` to map relevant files.
*   Trace execution paths for existing features similar to the new one.
*   Identify dependencies and potential side effects.
*   **Output**: A list of files to modify and a mental model of the architecture.

## Phase 3: Clarifying Questions
**Goal**: Resolve ambiguity.
**Actions**:
*   If requirements are vague, stop and ask the user.
*   Propose potential solutions to check alignment.
*   Confirm the "Definition of Done".

## Phase 4: Architecture Design
**Goal**: Plan HOW to build it.
**Actions**:
*   Propose an implementation plan.
*   List existing components to reuse.
*   Define new data structures or APIs.
*   **Gate**: Ask user for approval of the plan before coding.

## Phase 5: Implementation
**Goal**: Write the code.
**Actions**:
*   Follow the plan.
*   Create new files/components first.
*   Integrate into existing logic.
*   Keep changes focused (small batches).

## Phase 6: Quality Review
**Goal**: Verify correctness and safety.
**Actions**:
*   Run `Security Auditor` to check for risks.
*   Run lints/tests if available.
*   Manual self-review: "Did I break existing functionality?"

## Phase 7: Summary & Ship
**Goal**: Hand off to the user.
**Actions**:
*   Summarize what was changed.
*   Provide instructions on how to test the new feature.
*   List any remaining "todos" or follow-up items.
