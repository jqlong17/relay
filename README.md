# Relay

Relay is a Codex CLI based web workspace for AI conversations, session management, memory management, and goal-oriented automation.

## Core Value

- Keep work continuous across long-running conversations.
- Turn important sessions into reusable memory.
- Use automation to keep goals moving after the current reply.

## Product Overview

### About / Home

![Relay home](docs/images/home-about.png)

The homepage explains the product model clearly: `Session -> Memory -> Automation`.

### Workspace

![Relay workspace](docs/images/workspace.png)

Workspace is the main operating surface for continuing tasks, viewing context, and working with files in one place.

### Sessions

![Relay sessions](docs/images/sessions.png)

Sessions helps users organize conversation history and find the threads that should become long-term assets.

### Memories

![Relay memories](docs/images/memories.png)

Memories turns key session output into structured, durable context that can be retrieved later.

### Automation

![Relay automation](docs/images/automation.png)

Automation lets users define recurring or long-horizon execution tied to concrete goals.

### Settings

![Relay settings](docs/images/settings.png)

Settings are file-driven, so product behavior can be managed through TOML rather than UI toggles.

## Deployment

Render and public-network acceptance notes live in:

- [`docs/render-acceptance.md`](/Users/ruska/project/web-cli/docs/render-acceptance.md)
- [`render.yaml`](/Users/ruska/project/web-cli/render.yaml)

For `v0.1.6`, GitHub login is handled through the Supabase GitHub provider, so the web app itself only needs the Relay session secret and Supabase public credentials at runtime.
