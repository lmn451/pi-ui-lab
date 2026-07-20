# Approved Plan Loop v1

## Summary

Deliver `pi-ui-lab` as a deterministic replay engine first, terminal capture and regression suite second, and interactive debugger third. The implementation must keep production extension code as the system under test, make semantic/cell assertions authoritative, and defer Pi `/ui-lab` integration until the standalone inspector and replay/capture formats are stable.

## Phase 0 — Dependency and integration spike

- Prove a minimal extension loads in-process through `PiHarnessSutAdapter`.
- Prove `--mode sut` executes real extension code and fails if the extension module is replaced with a no-op.
- Confirm `@gaodes/pi-test-harness` API/lifecycle compatibility and valid SUT extension/module paths.
- Prove production UI state, reducer activity, poller calls, recovery paths, and render boundaries can be observed without copying renderer logic.
- Prove Pi can start in a fixed-size PTY when process dependencies are available.
- Prove ANSI can be captured into a cell grid.
- Prove SVG and PNG can be generated headlessly when image dependencies are available.
- Prove fake clock reaches production polling code or identify the safe test boundary that allows clock injection.
- Exit gate: one synthetic running-agent fixture renders through both in-process SUT and process paths, with operational capability status recorded.

## Phase 1 — Deterministic replay core

- Implement versioned fixture validation, path resolution, sandboxed imports, traversal/absolute-path rejection, source immutability checks, redaction, and import manifests with hashes/redaction status.
- Implement virtual clock, deterministic scheduler, canonical same-timestamp ordering, stable sequence IDs, event normalization, and checkpoints.
- Record ordered processed event IDs on every frame.
- Implement reload by creating a new runtime instance and preserving only declared stores.
- Implement JSON, ANSI, and clean-text replay output.
- Add native timer leakage detection, poller/global cleanup, max-step, max-duration, and zero-delay loop guards.
- Exit gate: identical input produces byte-identical JSON and text snapshots across 100 in-process runs and 100 fresh-process runs.

## Phase 2 — Semantic state and recovery

- Implement production state observer for footer, widgets, notifications, cursors, receipts, and artifact events.
- Ensure SUT semantic frames are derived from production extension observations, not only replay model state.
- Implement semantic frame models and matchers.
- Cover recovery, duplicate receipt suppression, stale, failed, and completed-with-errors fixtures.
- Exit gate: semantic scenarios pass in SUT mode without terminal screenshots and fail when production extension behavior is replaced by a no-op.

## Phase 3 — Terminal capture

- Implement ANSI capture, normalized text, cell-grid normalization, cursor state, resize behavior, overflow/collision reports, SVG, and PNG.
- Mark PTY, PNG, and process capabilities as implemented, stubbed, optional, or unavailable.
- Implement operational `doctor` probes for PTY spawn and PNG render support.
- Implement screenshot/snapshot update and diff artifacts.
- Exit gate: real Pi TUI is captured headlessly at 60 and 100 columns when process dependencies are operational; otherwise conformance is explicitly unavailable and not claimed.

## Phase 4 — Matrix runner and CI

- Implement width/theme matrix expansion for 60, 80, 100, 120, and 160 columns across light and dark themes.
- Implement sharding, JSON/JUnit reports, snapshot manifest metadata, and failure artifact bundles.
- Separate fast semantic/text/cell tests from optional conformance PTY screenshot tests.
- Ensure missing PTY/PNG dependencies skip or fail only conformance suites according to configured policy, not semantic CI.
- Exit gate: `pi-ui-lab test --matrix`, `pi-ui-lab test --update`, semantic CI, and conditional conformance CI behave according to capability status.

## Phase 5 — Standalone inspector

- Implement `pi-ui-lab inspect` on the same replay session API.
- Support stepping, play/pause, checkpoint/time jumps, width/theme cycling, event/state panels, screenshot saving, and search.
- Exit gate: inspector exercises existing replay sessions without introducing separate replay logic.

## Phase 6 — Pi `/ui-lab` command

- Add the Pi extension command only after standalone inspector stability.
- Keep the command a thin shell over the shared inspector controller.
- Target this phase for `0.2`, not the first useful `0.1` release.
- Exit gate: `/ui-lab` introduces no second replay, capture, or inspector implementation.

## Dependency order

1. Phase 0 must complete before implementation hardens around any backend, SUT, PTY, PNG, or clock-injection choice.
2. Phase 1 must complete before semantic, terminal, matrix, or inspector work depends on replay output.
3. Phase 2 depends on Phase 1 and must complete before semantic assertions become release gates.
4. Phase 3 depends on Phases 1-2 so terminal artifacts attach to authoritative semantic frames.
5. Phase 4 depends on Phases 1-3 so matrix and CI run stable replay, semantic, and capture paths.
6. Phase 5 depends on Phases 1-4 so the inspector uses stable replay/session/capture APIs.
7. Phase 6 depends on Phase 5 and stable public formats.

## Acceptance gates

- `npm run check` passes before release.
- `pi-ui-lab replay fixtures/recovery/recovered-result.json --format text` is deterministic.
- SUT mode executes real extension code, records production UI/poller calls, and fails with a no-op extension module.
- Mixed same-timestamp fixture produces documented byte-identical frame traces across 100 repeated runs.
- 100 in-process and 100 fresh-process replay runs produce identical JSON/text.
- Intentional zero-delay timer loop fails with a documented guard error.
- Traversal fixture is rejected, secret fixture is redacted, manifest records redaction, and pre/post source hashes are unchanged.
- `pi-ui-lab screenshot fixtures/recovery/recovered-result.json --format png --output recovery.png` works headlessly only when PNG backend is operational.
- `pi-ui-lab test --matrix` covers required width/theme combinations.
- `pi-ui-lab test --update` updates approved snapshots and manifests only.
- `pi-ui-lab inspect fixtures/recovery/recovered-result.json` runs against the shared replay API.
- `pi-ui-lab doctor` reports Pi compatibility, optional backend availability, implemented/stubbed/optional/unavailable capability status, image/font status, and PTY screenshot readiness.

## NO-GO blockers

| blocker | status | phase work | required tests |
|---|---|---|---|
| Parallel implementation false confidence | mitigated | Phase 0 proves `PiHarnessSutAdapter`; Phase 2 derives SUT semantic frames from production observations, not replay-only state. | Running-agent fixture in SUT mode executes real extension code, records production UI/poller calls, and fails with a no-op extension module. |
| Incomplete same-timestamp ordering | mitigated | Phase 1 defines canonical ordering, stable sequence IDs, and ordered processed event IDs on every frame. | Mixed same-timestamp fixture produces documented byte-identical frame trace across 100 repeated runs. |
| Wall-clock and async nondeterminism | mitigated | Phase 0 confirms clock injection boundary; Phase 1 adds fake clock, leakage detection, cleanup, and scheduler guards. | 100 in-process and 100 fresh-process runs produce identical JSON/text; intentional zero-delay timer loop fails with documented guard error. |
| Fixture/artifact safety gap | mitigated | Phase 1 sandbox-copies imports, rejects traversal/absolute paths, enforces immutability, redacts secrets/home paths, and emits hash/redaction manifest. | Traversal fixture is rejected, secret fixture is redacted, manifest records redaction, and pre/post source hashes are unchanged. |
| PTY/PNG/process coverage overclaim | mitigated | Phase 3 records capability states and adds operational `doctor` probes; Phase 4 separates semantic CI from optional conformance CI. | Without deps, `doctor` reports PTY/PNG unavailable and only conformance suite is skipped/failed; with deps, real PTY spawn and PNG render probes pass before marking operational. |

- Do not proceed if any blocker above regresses from `mitigated` to `pending`.
- Do not proceed if production extension/rendering code is replaced by copied renderer logic or a parallel UI implementation.
- Do not proceed if fixture import mutates source fixtures or real session artifacts.
- Do not proceed if unknown event types pass validation by default.
- Do not proceed if replay-sensitive modules use native timers instead of injected clock/scheduler paths.
- Do not proceed if repeated replay output is nondeterministic.
- Do not proceed if reload tests reset in-memory objects instead of reconstructing runtime state with declared persistence.
- Do not proceed if PNG comparison becomes the primary correctness signal.
- Do not proceed if critical fixtures rely on snapshots without semantic assertions.
- Do not proceed if Unicode/wide-cell behavior is measured by string length instead of cell-aware logic.
- Do not proceed if Pi-specific imports leak outside `pi-adapter`.
- Do not proceed with `/ui-lab` until standalone inspector and replay/capture/snapshot formats are stable.
