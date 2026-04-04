---
name: codex-memory
description: Retrieve, inject, and save Relay timeline memories from Codex using the shared SQLite-backed memory store.
---

# Codex Memory

## Use this skill when

- The user asks to recall prior project memory or timeline memory
- The user asks to inject saved memory into the current discussion
- The user asks to save the current conversation as a durable timeline memory

## What this skill does

1. Treat the current repository root as the plugin root host.
2. Use the shared Relay memory store through the plugin CLI:

```bash
node --import tsx ../../scripts/memory_cli.ts search --query "<query>" --limit 5
```

3. When the user needs a reusable context block, run:

```bash
node --import tsx ../../scripts/memory_cli.ts inject --query "<query>" --limit 5
```

4. When the user explicitly wants to persist a new timeline memory:
   - first summarize the current discussion into the Relay timeline-memory format
   - then save it with:

```bash
node --import tsx ../../scripts/memory_cli.ts save-timeline \
  --session-id "<session-id>" \
  --workspace-id "<workspace-id>" \
  --theme-title "<theme-title>" \
  --checkpoint-turn-count <turn-count> \
  --content-file "<tmp-markdown-file>"
```

## Operating rules

- Prefer `inject` when the user wants memory used as context for the current turn.
- Prefer `search` when the user wants to browse or identify candidate memories first.
- Only use `save-timeline` when the user explicitly asks to save or persist memory.
- Keep memory titles concise and theme-led, following the session title when available.
- Do not invent missing user decisions; the saved content should follow Relay's timeline memory format.

## Notes

- This plugin shares the same SQLite-backed memory store used by Relay Web.
- The current formal plugin focuses on timeline memory retrieval, injection, and saving.
- Preference-memory generation can be added on top of the same `memory-core` later without changing the plugin shape.
