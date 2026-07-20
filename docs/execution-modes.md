# Execution modes

`pi-ui-lab test` uses an explicit execution mode. Modes are isolated in reports and snapshot paths and never silently fall back to another implementation.

## Model mode

```bash
pi-ui-lab test fixtures/**/*.json --mode model
```

Model mode replays fixtures through pi-ui-lab's deterministic state model. It is intended for replay, scheduling, recovery, and fixture tests. It produces semantic text snapshots only and is not evidence that a production Pi extension rendered correctly.

## SUT mode

```bash
pi-ui-lab test fixtures/**/*.json --mode sut \
  --sut-extension /path/to/extension.ts \
  --sut-module /path/to/module.ts \
  --sut-cwd /tmp/pi-ui-lab-sandbox
```

SUT mode loads the explicitly configured production extension through `@gaodes/pi-test-harness`. It verifies production hooks, polling behavior, recovery, and observable Pi UI API calls. Both SUT paths are mandatory; failure to load the SUT fails the run.

SUT mode produces semantic snapshots. It does not claim terminal-layout conformance because the harness observes UI calls rather than a real terminal.

## PTY mode

```bash
pi-ui-lab test fixtures/**/*.json --mode pty \
  --sut-extension /path/to/extension.ts \
  --sut-module /path/to/module.ts \
  --sut-cwd /path/to/project
```

PTY mode launches a real Pi process and captures text and terminal cells. It is the authoritative mode for layout, ANSI, width, theme, cursor, resize, and overflow checks. An operational `node-pty` backend and explicit SUT configuration are required.

## CI policy

Recommended tiers:

1. Every commit: model tests, SUT semantic tests, typecheck, and lint.
2. Pull requests: PTY smoke tests at representative widths and themes.
3. Nightly or release: the complete PTY width/theme matrix.

Missing required snapshots and corrupt snapshots fail. Generate baselines explicitly with `--update`. Snapshot keys include the execution mode and fixture path, preventing cross-mode comparisons and same-basename collisions.
