# Relay

Relay is a web workspace for driving a local Codex runtime from a browser.

It keeps the local workspace as the execution boundary while exposing sessions, files, and runtime activity through a web UI that can be resumed across devices.

## What Relay Is

Relay is not a hosted agent runtime and not just a browser terminal.

It is a thin web layer on top of:

- a local bridge service that can see the active workspace
- the Codex app server that owns threads and turns
- a browser UI for workspace switching, session continuity, file inspection, and streaming runs

The product shape is intentionally simple:

- `workspace`: open a local folder, browse files, inspect previews, continue the active thread
- `sessions`: review, rename, archive, and resume Codex-backed sessions
- `memories`: a product surface for durable memory workflows
- `readme`: explicit project context and onboarding

## Current Scope

The repository already supports the core local loop:

- open a local workspace from the web UI
- list workspaces and remember the preferred session per workspace
- list Codex threads for the active workspace
- create draft sessions before the first runtime turn
- rename and archive sessions
- stream runtime output from Codex into the web client
- inspect the active workspace file tree and preview file contents
- use a dedicated mobile route for lightweight remote continuation

Some surfaces are more product-shaped than fully wired yet. In particular, the `memories` page currently represents the intended UX and information architecture more than a completed backend feature.

## Architecture

Relay is a small monorepo with three main layers:

### 1. Web App

[`apps/web`](/Users/ruska/project/web-cli/apps/web) is a Next.js app that renders the desktop and mobile workspace UI.

Key responsibilities:

- top-level navigation and page shells
- workspace, session, and mobile clients
- calling the local bridge from server and client components
- rendering file previews and runtime message streams

### 2. Local Bridge

[`services/local-bridge`](/Users/ruska/project/web-cli/services/local-bridge) is a Node HTTP service that translates the web UI into local operations.

Key responsibilities:

- workspace open/list/remove flows
- active workspace state
- file tree and file content access inside the active workspace boundary
- session creation, rename, archive, and selection
- starting and streaming Codex turns

Important routes:

- `GET /health`
- `GET /workspaces`
- `POST /workspaces/open`
- `POST /workspaces/open-picker`
- `GET /sessions`
- `GET /sessions/:id`
- `POST /sessions`
- `POST /sessions/:id/select`
- `POST /sessions/:id/rename`
- `POST /sessions/:id/archive`
- `GET /files/tree`
- `GET /files/content?path=...`
- `POST /runtime/run?stream=1`

### 3. Shared Types

[`packages/shared-types`](/Users/ruska/project/web-cli/packages/shared-types) contains the contracts shared by the web app and the bridge.

## How Runtime Integration Works

Relay does not implement its own agent engine.

The bridge starts and talks to `codex app-server --listen stdio://`, then maps Codex thread and turn notifications into Relay runtime events for the browser.

That means Relay currently assumes:

- `codex` is installed and available on `PATH`
- the local machine is the execution environment
- the browser UI is a control and inspection surface, not the source of workspace truth

## Development

### Prerequisites

- Node.js 20+
- `pnpm`
- `pm2`
- `codex` available on `PATH`

Install dependencies:

```bash
pnpm install
```

Start both services:

```bash
pnpm dev:up
```

This runs [`dev-up.sh`](/Users/ruska/project/web-cli/dev-up.sh), which starts:

- `relay-bridge` on `http://127.0.0.1:4242`
- `relay-web` on `http://127.0.0.1:3000`

Stop both services:

```bash
pnpm dev:down
```

Useful `pm2` commands:

```bash
pm2 ls
pm2 logs relay-web
pm2 logs relay-bridge
pm2 restart relay-web relay-bridge
pm2 stop relay-web relay-bridge
```

Process definitions live in [`ecosystem.config.cjs`](/Users/ruska/project/web-cli/ecosystem.config.cjs).

## Repository Layout

```text
.
├── apps/
│   └── web/
├── packages/
│   └── shared-types/
├── services/
│   └── local-bridge/
├── dev-up.sh
├── dev-down.sh
└── ecosystem.config.cjs
```

## Product Direction

Relay is aiming for a calm, inspectable agent workspace rather than a terminal clone.

The product direction is:

- keep the local workspace as the execution truth
- make sessions resumable and readable from anywhere
- expose files and changes as first-class context
- support both desktop and mobile continuation
- leave room for durable memory and project-context layers

## Documentation Rule

This file is the primary README for the repository and should remain the single source of truth for project-level documentation.

If another surface needs README content, it should reference or render this file rather than maintain a second copy.
