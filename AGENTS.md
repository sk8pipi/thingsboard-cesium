# Repository AI Instructions

Every AI agent working in this repository must read
`docs/ai/video-platform-architecture.md` completely before analyzing, planning,
or modifying the project.

The document is the authoritative architecture and decision record for:

- ThingsBoard camera devices and identity.
- WVP-GB28181-pro and ZLMediaKit integration.
- Video API boundaries and provider extensions.
- Video playback URL generation and reverse proxy rules.
- Cesium camera point bindings, monitoring playback, snapshots, PTZ, recording,
  and stream status.
- The local containerized video validation environment.

Do not silently introduce a conflicting identity model, store runtime playback
URLs as authoritative ThingsBoard attributes, expose credentials to the
frontend, or add new frontend URL-derivation rules.

If a task intentionally changes a documented architecture decision, update the
architecture document in the same change and clearly record the migration and
compatibility impact.

