# GEMINI.md

## Mission

GeminiApp must be built as a production-grade Windows desktop client that can eventually support:

- near-full UX parity with the Codex desktop app;
- broad operational parity with Gemini CLI capabilities;
- clean extension into advanced surfaces such as sessions, tools, workspaces, diagnostics, settings, search, automations, logs, and rich activity views.

The architecture must therefore optimize not just for the current MVP, but for future expansion without major rewrites.

## Core product principles

- Gemini CLI is the runtime authority.
- The desktop app is a durable shell around Gemini CLI, not a second independent agent runtime.
- UX should be calm, premium, and structurally comparable to Codex.
- New functionality must be added by extending clear layers, not by inserting ad hoc glue into the renderer.
- Every current decision should preserve a future path toward broader Codex-like functionality.

## Long-term target

The codebase should be ready to grow into these product areas without architectural rework:

- multi-chat workspace shell;
- persistent chat history and resumable sessions;
- richer activity and tool logs;
- workspace trust/setup flows;
- model and approval-mode management;
- diagnostics and environment validation;
- search across chats/projects;
- plugin- or extension-like capability surfaces;
- automation and scheduled workflows;
- right-side context panels, inspectors, and detail drawers;
- richer terminal/process visibility;
- future optional support for MCP-like integrations if Gemini CLI exposes or interoperates with them.

## Architectural doctrine

### High-level layering

- `app/main`
  Owns Electron lifecycle, process orchestration, Gemini CLI runtime control, dependency installation/detection, persistence, diagnostics, environment checks, session orchestration, and IPC registration.

- `app/preload`
  Owns a narrow typed bridge. It must expose explicit capability groups, never generic unrestricted access.

- `app/renderer`
  Owns presentation, local UX orchestration, shell composition, view state, and interaction logic only.

- `app/shared`
  Owns shared contracts: DTOs, event payloads, settings, view models, status enums, domain shapes, and stable IPC payload types.

- `config`
  Owns runtime defaults, CLI flags, install commands, model catalogs, dependency catalogs, feature flags, and any future capability manifests.

### Separation rules

- Do not let renderer code know how Gemini CLI is spawned.
- Do not let main-process code depend on React/UI implementation details.
- Do not hardcode runtime commands, install commands, models, or dependency checks inside components.
- Do not mix persistence concerns with rendering concerns.
- Do not collapse all capabilities into one large store action or one large IPC file if the domain can be decomposed.

## Future-ready module boundaries

The codebase should gradually converge toward explicit service modules in `app/main`, for example:

- `cli-runtime`
  Low-level Gemini CLI process spawning, output parsing, cancellation, timeouts, and event normalization.

- `cli-health`
  Runtime availability checks, auth heuristics, environment warnings, workspace capability checks.

- `environment`
  Installation detection, optional dependency checks, setup actions, PATH/path-candidate resolution.

- `session-service`
  Chat/session creation, resume/open behavior, session metadata, active session coordination.

- `workspace-service`
  Workspace registration, trust state, path validity, active workspace state, future setup policies.

- `diagnostics-service`
  Logs, snapshots, export, failure classification, supportability.

- `settings-service`
  Stable settings persistence and migrations.

- `feature-registry`
  Capability flags and config-driven enablement for future Codex-like surfaces.

This does not all need to exist immediately, but new work should move toward these boundaries, not away from them.

## UI shell doctrine

The renderer should be built to naturally support a Codex-like shell:

- top bar;
- left navigation/sidebar;
- central chat canvas;
- optional bottom composer/workspace strip;
- future right-side panel;
- future overlays for settings, search, diagnostics, and setup.

### Layout rules

- Keep shell regions structurally independent.
- Avoid monolithic page components.
- Components should be reusable across empty/loading/active/error states.
- State transitions should preserve layout stability as much as possible.

### Design rules

- The app must feel intentional, not generic.
- Typography, spacing, contrast, and panel structure must communicate hierarchy clearly.
- Setup screens must look like part of the product, not placeholders.
- Error and warning states must be elegant and readable.
- Rich activity/log cards should be visually distinct from chat messages.

## Gemini CLI integration doctrine

### Source of truth

- Gemini CLI is the source of truth for runtime behavior and auth state.
- When CLI behavior is ambiguous, prefer documented CLI behavior over assumptions.
- If the CLI lacks an official status endpoint, represent ambiguity explicitly in UI and state.

### Capability coverage

The architecture should be ready to incorporate broader Gemini CLI features such as:

- interactive and headless modes;
- model switching;
- approval modes;
- workspace/sandbox-related flags;
- session resume behavior;
- richer output modes;
- future CLI extensions or subcommands;
- structured activity emitted by the CLI.

### Integration rules

- Keep the low-level spawn and parse logic centralized.
- Normalize CLI output into internal events before it reaches the renderer.
- Distinguish transport/process errors from semantic auth/runtime errors.
- Support future parser expansion without changing renderer contracts.
- Prefer an internal event model broad enough to support tokens, tool calls, tool results, stderr, diagnostics, session info, and completion summaries.

## Event contract doctrine

Design internal events as if the app will later need to visualize:

- streaming assistant output;
- command/runtime events;
- tool activity;
- file/workspace operations;
- approvals/decisions;
- diagnostics warnings;
- system notices;
- session lifecycle events.

Do not keep event contracts so minimal that future UI parity would require breaking rewrites.

## Configuration doctrine

All mutable operational defaults should live in config, not in components:

- model options;
- CLI executable candidates;
- install commands;
- optional dependency definitions;
- health-check prompts and flags;
- feature toggles;
- future capability visibility rules.

### Rules

- Add config first, then wire code.
- Renderer reads config-derived state, not raw config files directly.
- Avoid scattering the same literal values across files.
- Optional dependencies must be represented as first-class config entries.

## Dependency and setup doctrine

- Automate installation of everything reasonably automatable.
- Keep required vs optional dependencies explicit.
- Setup should explain what is missing, why it matters, and what the app can do automatically.
- Missing optional dependencies should degrade gracefully with clear warnings.
- Setup actions must remain centralized and config-driven.

The setup flow should eventually be able to support:

- install CLI;
- detect CLI;
- open login terminal;
- verify runtime availability;
- install optional helpers;
- explain degraded states;
- route users into the main shell as soon as practical.

## Auth doctrine

- Authentication UX should follow Gemini CLI realities, not invented flows.
- Manual auth confirmation is acceptable as a fallback when the CLI visually confirms sign-in but no official programmatic auth-status command exists.
- If a real prompt fails with an auth-specific error, invalidate the assumed auth state and route back to setup/login.
- Keep auth state explicit in settings and diagnostics.

## Persistence doctrine

Persist data in a way that supports future Codex-like expansion:

- stable settings schema;
- durable workspace records;
- durable chat/session metadata;
- durable message history;
- durable activity history;
- future migrations without brittle rewrites.

Rules:

- Version persisted structures when needed.
- Keep migration paths explicit.
- Avoid hidden coupling between storage shapes and UI implementation details.

## IPC doctrine

IPC must be capability-oriented, not blob-oriented.

Prefer capability groups such as:

- `settings.*`
- `projects.*`
- `chat.*`
- `cli.*`
- `environment.*`
- `diagnostics.*`
- future `search.*`
- future `sessions.*`
- future `automations.*`

Rules:

- Keep payloads typed and narrow.
- Avoid catch-all endpoints.
- Avoid leaking Electron primitives or Node internals to renderer.

## Renderer state doctrine

The renderer store should orchestrate app behavior, not absorb platform logic.

Rules:

- Keep state normalized where helpful.
- Keep async actions small and explicit.
- Push process-specific logic to IPC/main services.
- Treat setup, shell, sessions, and diagnostics as explicit state domains.
- Design state so future Codex-like side panels and search views can be added cleanly.

## Diagnostics doctrine

Diagnostics must be designed for real support and future complexity.

Distinguish at minimum:

- CLI missing;
- CLI path invalid;
- auth incomplete;
- runtime timeout;
- non-fatal degraded mode;
- prompt failure;
- parser failure;
- environment warning.

Logs are not the primary UI, but they must be sufficient for debugging.

## UX states doctrine

Every important screen should support explicit states:

- first launch;
- loading;
- install required;
- auth required;
- degraded but usable;
- workspace missing;
- empty chat;
- active chat;
- streaming;
- recoverable error;
- fatal error.

Do not compress materially different states into one generic placeholder.

## Code quality doctrine

- Prefer explicit domain names over vague helpers.
- Prefer small services over giant files with unrelated responsibilities.
- Prefer typed contracts over stringly-typed branching.
- Prefer composition over entangled state mutations.
- Remove dead paths once a better approach replaces them.

### Cleanliness rules

- One file should have one clear job.
- If a file starts owning multiple concerns, split it.
- Comments should explain why, not restate what.
- Avoid speculative abstractions, but absolutely avoid accidental architecture.

## Production-readiness rules

Before treating any meaningful change as complete:

- `npm run typecheck` must pass.
- `npm run build` must pass.
- Dev startup must still work from a clean machine state.
- New dependency/setup logic must surface correctly in UI.
- Config-driven behavior must remain centralized.
- Error messages must remain actionable.

## Future Codex-parity planning rules

When implementing new features, ask:

- Does this move the app closer to a reusable Codex-like shell?
- Does this capability belong in a reusable service or is it being buried in a page component?
- Would adding search/automation/right-panel/session-resume later be harder because of this design?
- Does this change preserve a path toward richer activity visualization and structured runtime events?

If the answer is "this solves today but makes Codex-level parity harder later", redesign it.

## Preferred development direction

Each next iteration should make GeminiApp:

- more config-driven;
- more service-oriented in `main`;
- more shell-oriented in `renderer`;
- more explicit in diagnostics;
- more extensible toward Codex-like product breadth;
- more faithful to Gemini CLI behavior without becoming tightly coupled to one brittle parsing trick.
