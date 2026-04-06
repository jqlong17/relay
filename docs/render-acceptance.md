# Relay Render Deployment And Acceptance

This document is the execution baseline for `v0.1.6` public-network acceptance.

## 1. Actual Runtime Requirements

Required on the web service:

- `RELAY_SESSION_SECRET`
- `RELAY_PUBLIC_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional:

- `RELAY_ACCESS_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Important:

- GitHub login is currently handled through the Supabase GitHub provider.
- That means the Relay app itself does not need `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET`.
- The GitHub provider callback URL in Supabase must point to:

```text
https://your-public-domain/auth/callback
```

## 2. Local Production Acceptance

Use production mode, not `next dev`.

```bash
pnpm --filter web build
pnpm --filter web exec next start --hostname 0.0.0.0 --port 3000
```

In another terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:3000
```

Acceptance paths:

- `/login`
- `/settings`
- `/workspace`
- `/mobile`

Rules:

- Ignore `cloudflared` reconnect noise unless the page path becomes unavailable.
- If you see `/_next/webpack-hmr` errors, you are still testing a dev server instead of production mode.

## 3. Render Deployment

The repo now includes [`render.yaml`](/Users/ruska/project/web-cli/render.yaml) as the canonical deployment entry.

Equivalent commands:

Build:

```bash
corepack enable && pnpm install --frozen-lockfile && pnpm --filter web build
```

Start:

```bash
pnpm --filter web exec next start --hostname 0.0.0.0 --port $PORT
```

## 4. Render Acceptance Checklist

### A. Configuration

- Render service is created from this repo root.
- `render.yaml` is detected or the same build/start commands are configured manually.
- `RELAY_PUBLIC_BASE_URL` is the final public Render URL, without a trailing slash.
- `RELAY_SESSION_SECRET` is a long random value.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` match the target Supabase project.
- Supabase GitHub provider is enabled.
- Supabase provider callback URL points to `https://your-render-domain/auth/callback`.

### B. Deployment

- Latest branch is pushed to GitHub.
- Render build succeeds without falling back to `next dev`.
- Render runtime starts successfully with `next start`.
- `/login` returns `200`.

### C. Product Paths

- `/login` can open and show GitHub sign-in.
- `/settings` can load without white screen.
- `/workspace` can open and show route/device status copy instead of raw internal errors.
- `/mobile` can open and show handoff state instead of desktop-style device management.

### D. Account And Device Flow

- Sign in with GitHub from desktop web.
- Redirect lands on `/workspace` or `/mobile` as expected.
- `/settings` shows current computer, default device, other devices, and historical devices in separate blocks.
- If there is no default device, current machine is auto-promoted after bootstrap.
- If the default device is offline but the current machine is available, `/workspace` shows local fallback copy.
- `/mobile` shows the reduced recovery hint for offline/default-device issues.

### E. Release Gate

- `pnpm --filter web build` passes locally.
- Target unit tests pass locally before push.
- Render deploy succeeds on the same commit.
- The four public routes stay usable after deploy:
  - `/login`
  - `/settings`
  - `/workspace`
  - `/mobile`

## 5. Expected Failure Patterns

`Your default Relay device is currently offline.`

- Meaning: cloud account state is valid, but the preferred device is not online.
- Expected product response: workspace/mobile should show recovery guidance, not just fail silently.

`GitHub cloud session expired`

- Meaning: Relay session cookie or Supabase-backed session is no longer valid.
- Expected product response: user is told to sign in again.

`malformed HTTP response "Unauthorized"` from `cloudflared`

- Meaning: you are usually proxying a dev-mode HMR websocket or a non-production path through the tunnel.
- Action: rebuild and retest with `next start`.
