# Builds central harness routing

Builds is the operator surface and session owner. Hermes, Claude SDK, and Pi
are adapters behind that surface; the user can still choose one directly or
open its companion site without losing the Builds session.

## Runtime contract

- The existing `/api/sessions/{id}/chat/stream` SSE contract remains the only
  chat door.
- The browser sends the preferred `harness` plus a `routing` envelope with the
  ordered chain and attempt number. Older gateways ignore the envelope safely.
- A fallback is attempted only when the adapter fails before the first
  assistant delta or tool event. Once work is visible, Builds keeps the error
  on that session instead of replaying the task through another adapter.
- Route changes are rendered in the transcript and the tab header, so a long
  dogfood run proves which adapter actually carried the work.
- The client keeps a four-hour stream ceiling and returns an abort handle so a
  user can close a tab without leaving a fetch running.

## Current default chains

| Preferred | Fallback order | Direct companion |
|---|---|---|
| Hermes | Pi -> Claude SDK | already inside Builds |
| Claude SDK | Pi -> Hermes | claude.ai |
| Pi.dev | Hermes -> Claude SDK | pi.dev |

The chain is stored with the tab selection and is visible before a run starts.

## Honest boundary for the VPS migration

The browser and the existing gateway session are now ready for central dogfood,
but this change does not pretend to be a new durable artifact/checkpoint
service. Session history is still the existing `/api/sessions` persistence
owned by the Builds gateway. The CX23 should remain the control surface and
workspace; AWS/ECS remains the build execution surface; the existing Hetzner
VPS remains the durable state and rollback anchor until a separate checkpoint
service is proved.

The next soak gate is a real authenticated run that lasts beyond the current
gateway timeout window and records heartbeats/checkpoints in the existing
session history. Do not call the migration complete until that live gate passes.
