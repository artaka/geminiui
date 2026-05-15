# GeminiUI

GeminiUI is a  Windows desktop client for the [Gemini CLI](https://github.com/google/gemini-cli). It provides a rich, Codex-like UX for interacting with Google's Gemini models locally on your machine.
<img src="https://i.ibb.co/G43RMzzD/image.png" alt="image" border="0" style="width:100%;"><br />

## Features

- **Local First**: Uses your locally installed Gemini CLI as the runtime authority.
- **Codex-like UX**: Familiar and powerful interface with a clean, professional aesthetic.
- **Workspace Integration**: Manage AI chats attached to your project folders.
- **Rich Activity View**: Visualize Gemini CLI's internal steps, tool calls, and reasoning.
- **File & Image Attachments**: Easily share context with the AI.
- **Agent Mode Control**: Switch between `yolo`, `auto_edit`, and `plan` modes with ease.
- **Sandbox Support**: Optional Docker-based sandbox for safe command execution.
- **Diff Previews & Reverts**: Review and undo changes made by the AI agent.
- **Command & File Suggestions**: Quick access to CLI commands and workspace files.
- **AI-Generated**: Developed using a complete AI-driven pipeline.
## Prerequisites

- **Windows**: Designed for Windows 10/11.
- **Node.js**: Version 22 or higher.
- **Gemini CLI**: Must be installed and authenticated (`npm install -g @google/gemini-cli`).
- **Optional**:
  - **Ripgrep**: For faster workspace search.
  - **Docker Desktop**: For sandbox capabilities.

## Getting Started

### Installation

1.  Download Gemini UI installer:
    [click here](https://github.com/artaka/geminiui/releases)
2.  Install application:
3.  Application ready to use!

### Or get the source code

1. Clone git repo:
    ```bash
    git clone https://github.com/artaka/geminiui.git
    cd geminiui
    ```
2. Install dependency:
    ```bash
    npm install
    ```

### Development

Run the app in development mode:
```bash
npm run dev
```

## Architecture

GeminiUI is built with Electron and React, following a strict layered architecture:

- `app/main`: Electron lifecycle, CLI orchestration, and persistence.
- `app/renderer`: React-based UI and state management (Zustand).
- `app/preload`: Typed IPC bridge.
- `app/shared`: Shared types and contracts.
- `config`: Runtime configuration and defaults.

## License

MIT
