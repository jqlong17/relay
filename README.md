# Relay

Relay is a web workspace for running your local AI agent from anywhere.

## Overview

Relay connects a local agent runtime with a browser-based workspace so work can continue across devices. Instead of treating the terminal as the product, Relay turns local agent capabilities into a clearer interface for conversations, execution flows, files, and changes.

The goal is to make local agent workflows feel continuous, inspectable, and easy to resume, whether you are at your desk or checking in from another device.

## Hero

**Your local agent, anywhere.**

Relay turns your local workspace into a web-native agent desk, so you can chat, inspect files, review changes, and keep work moving across devices.

## Why Relay

The name `Relay` reflects the core product idea:

- It is a bridge between your local machine and the web.
- It lets you hand work back and forth between yourself and the agent.
- It preserves continuity, so tasks can be resumed instead of restarted.

Relay is not just a web terminal. It is a workspace for staying connected to an agent that keeps moving with your work.

## Product Direction

Relay is designed as a three-pane workspace:

- Left: sessions and task history
- Center: conversation and execution timeline
- Right: file tree, file preview, and changes

The initial focus is AI-assisted work on a local workspace, with coding as the first strong use case but not the only one.

## V1 Principles

- Web-first experience
- Local workspace as the source of truth
- Natural language first, commands supported
- Smooth typing, streaming, and state transitions
- Clear visibility into files, edits, and task progress

## Development

Relay provides a root startup script for local development:

```bash
pnpm dev:up
```

This runs [`dev-up.sh`](/Users/ruska/project/web-cli/dev-up.sh), which:

- starts `services/local-bridge`
- starts `apps/web`
- checks the bridge health endpoint at `http://127.0.0.1:4242/health`
- checks the web app at `http://127.0.0.1:3000`

You can also run the script directly:

```bash
bash ./dev-up.sh
```

To stop both services:

```bash
pnpm dev:down
```

Or run the stop script directly:

```bash
bash ./dev-down.sh
```

After startup:

- Relay web: `http://127.0.0.1:3000`
- Local bridge health: `http://127.0.0.1:4242/health`

Logs and process ids are written to:

- `.relay-dev/web.log`
- `.relay-dev/local-bridge.log`
- `.relay-dev/web.pid`
- `.relay-dev/local-bridge.pid`

## Long-Term Vision

Relay should let a user start work on their computer and continue it from any browser, including mobile, without losing context. The agent stays close to the local workspace, while the interface stays accessible from anywhere.
