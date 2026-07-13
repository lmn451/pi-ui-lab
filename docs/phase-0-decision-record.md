# Phase 0 decision record

## Scope

`pi-ui-lab` is an in-process deterministic replay and capture tool. In-process
execution is the default CI path: it exercises the replay and production
adapter without requiring a model, tmux, or a terminal process.

## PTY capability

PTY support is optional and is not represented by the in-process path. The
process contract checks for `node-pty`, `termless`, and `ptywright` at runtime
using package resolution only; none is a hard or bundled runtime dependency.
The first available package is reported by `getPtyBackendStatus()`. If no
package is installed, a PTY request fails with
`PtyBackendUnavailableError` and does not silently fall back to in-process
execution. In the current installation, all three optional backends are
unavailable.

This keeps CI useful without overstating process-level coverage. A future PTY
adapter must use the selected package to launch the real Pi CLI, set fixed
dimensions, and capture its terminal output; capability detection alone does
not claim that conformance path is implemented.

## Capture outputs

ANSI is normalized into a cell grid and can be rendered deterministically to
text and SVG. SVG is currently available without an optional dependency. PNG
is intentionally unavailable in this package: `generatePng()` fails explicitly
until a host application supplies an image adapter. PNG comparison is not a
Phase 0 correctness signal.

## Virtual clock

Replay uses the `Clock` contract and `VirtualClock` for deterministic timer
advancement. Production polling code can receive the same clock interface,
while wall-clock implementations remain available for normal execution. The
virtual clock is therefore the integration boundary for deterministic polling,
not a second renderer or a PTY substitute.

## Decision

Keep in-process replay as the supported baseline, keep PTY and PNG adapters
optional, and report each capability explicitly in `pi-ui-lab doctor`.
