# PLAN.md - GeminiApp implementation plan

## Summary

Build an MVP Windows desktop client on Electron that feels close to Codex while using local Gemini CLI as the primary runtime. The first release includes Google sign-in, workspace management, chat history, streaming assistant responses, secure token storage, and a stable shell for future features.

## Key Changes

- Set up an Electron monorepo layout with `app/main`, `app/preload`, and `app/renderer`.
- Implement a secure IPC boundary with preload APIs for auth, projects, chat, diagnostics, and CLI runtime.
- Build a Codex-like dark desktop shell with sidebar, top bar, empty state, settings, and active chat flows.
- Add Google OAuth via PKCE in the main process and store tokens in secure storage.
- Add a Gemini CLI session manager that streams process output into renderer chat/activity events.
- Persist workspaces, chats, UI state, and active selections in local app data storage.

## Public Interfaces

- `auth.login()`, `auth.logout()`, `auth.getSession()`
- `projects.list()`, `projects.add()`, `projects.setActive()`
- `chat.list()`, `chat.create()`, `chat.open()`, `chat.send()`, `chat.stop()`
- `cli.getStatus()`, `cli.recheck()`, `cli.onEvent()`
- `settings.get()`, `settings.update()`
- `diagnostics.getSnapshot()`, `diagnostics.exportLogs()`

## Test Plan

- Verify first run opens onboarding instead of a broken main shell.
- Verify login state survives restart and logout clears secure session.
- Verify missing Gemini CLI shows a configuration error instead of silent failure.
- Verify adding a workspace, creating a chat, sending a prompt, streaming output, and restoring the session after restart.
- Verify packaged Windows build starts, creates app data, and shuts down child processes cleanly.

## Assumptions

- MVP only; search, plugins, automations, and advanced right-side panels stay out of scope.
- Gemini CLI is the required runtime in v1.
- Local JSON persistence is acceptable for the first release.
