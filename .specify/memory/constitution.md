# EducationalProject Constitution

## Core Principles

### I. Readable and Consistent Code

Code MUST use descriptive names, explicit control flow, and consistent conventions within
each language. Functions and modules MUST have a coherent responsibility. Comments MUST
explain constraints or non-obvious decisions rather than repeat the implementation.
Changes MUST remove dead code they introduce or render obsolete. Applicable formatter,
linter, and type-checker findings in changed code MUST be resolved; suppressions MUST
include a specific justification. Readability makes review and later changes safer.

### II. Simple Module Boundaries

Implementations MUST use the simplest design that satisfies documented requirements.
New abstractions and dependencies MUST have a current use case and a rationale recorded
in the plan or change description. Modules MUST expose explicit contracts and avoid
accessing another module's private implementation. Business rules MUST be separable
from external I/O where needed for deterministic testing. Generalization for hypothetical
features MUST be deferred until a concrete requirement exists.

### III. Behavior-Focused Testing

New or changed business rules and externally observable behavior MUST have automated tests
for expected outcomes, relevant boundaries, and failure paths. Tests MUST assert contracts
rather than duplicate implementation details. Bug fixes MUST include regression tests that
reproduce the defect before the fix when automation is feasible. Tests MUST control time,
randomness, and external services where these could cause nondeterminism. Documentation-only,
cosmetic, and other low-impact changes MAY use focused inspection instead; the change
description MUST explain the validation used. Coverage percentages MUST NOT substitute for
meaningful assertions. When automation is infeasible, record why and the alternative evidence.

### IV. Integration and Regression Coverage

Changes to persistence, public interfaces, or communication between modules or services
MUST include applicable integration or contract tests. Critical user journeys MUST be
identified in the specification and tested at the lowest level that proves the required
behavior. End-to-end tests MUST address gaps lower-level tests cannot prove.
Tests MUST be independent and clean up their resources. Flaky tests MUST be fixed or
tracked with an owner and a resolution condition. Silently skipping tests or weakening
assertions to obtain a passing build is prohibited.

### V. Maintainable Changes and Documentation

Changes MUST focus on a stated requirement or defect, with unrelated cleanup separated.
Setup instructions, interface documentation, and architectural decisions MUST be updated
when a change makes them inaccurate. Breaking contracts or stored-data changes MUST
document compatibility impact, migration steps, and recovery options before merge.
Deferred technical debt MUST record its impact and a concrete follow-up condition in an
issue or task. Documentation MUST explain decisions and operating procedures that cannot
be reliably inferred from the code.

## Quality Standards

- The first implementation for each selected language MUST establish reproducible build
  and test commands, formatting and linting rules, and type checking where supported.
  Required tool and runtime versions MUST be documented; supported dependency lockfiles
  MUST be versioned.
- External input MUST be validated at system boundaries. Errors MUST retain diagnostic
  context without exposing credentials or sensitive data. Silent failure is prohibited.
- New dependencies MUST be reviewed for necessity, license compatibility, maintenance
  status, and known security issues before adoption.
- Automated checks MUST run locally and in CI. CI MUST enforce applicable build,
  formatting, linting, type-checking, and test commands once implementation begins.
- Required checks MUST pass before merge. A check that cannot run MUST be reported as
  unverified with its reason; it MUST NOT be represented as successful.

## Development Workflow and Quality Gates

1. Define observable acceptance criteria and critical journeys in the specification.
2. Record affected contracts, design decisions, validation strategy, and a Constitution
   Check in the plan. Resolve conflicts or document an approved exception before
   implementing the conflicting work.
3. Break work into reviewable tasks with applicable tests and documentation.
4. Implement focused changes and run checks relevant to the affected behavior, followed
   by required project checks. Record failures and their resolution.
5. Before merge, review correctness, clarity, test adequacy, compatibility, and constitution
   compliance. The change description MUST record what changed, why, checks executed and
   their results, and remaining limitations.

## Governance

This constitution governs project specifications, plans, implementation, and reviews.
Dependent Spec Kit workflows MUST read the current constitution and assess compliance;
template examples do not override these rules.

Amendments MUST state the proposed change, rationale, impact on existing work, and any
migration needed. The project maintainer MUST approve amendments before adoption.
Each amendment MUST update the version and Last Amended date, preserving the original
Ratified date. MAJOR versions remove or incompatibly redefine principles; MINOR versions
add principles or materially expand requirements; PATCH versions clarify wording without
changing obligations.

Exceptions MUST identify the affected rule, justification, risk, compensating validation,
owner, and expiry date or removal condition. The project maintainer MUST approve an
exception before the affected change is merged. Reviewers MUST verify compliance or an
explicit approved exception; convenience alone does not justify bypassing a gate.

**Version**: 1.0.0 | **Ratified**: 2026-09-28 | **Last Amended**: 2026-09-28
