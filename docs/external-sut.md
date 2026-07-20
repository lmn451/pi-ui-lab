# External production SUT adapter

`PiHarnessSutAdapter` runs a production extension through the optional
`@gaodes/pi-test-harness` boundary. Select `--mode sut` and supply explicit paths:

```bash
pi-ui-lab test fixtures/*.json \
  --mode sut \
  --sut-extension /path/to/extension.ts \
  --sut-module /path/to/extension.ts \
  --sut-cwd /tmp/ui-lab-sandbox
```

The adapter materializes fixture artifact and state inputs on disk, then drives the
production extension's registered `session_start` handlers and interval callbacks
through `@gaodes/pi-test-harness`. `--sut-extension` and `--sut-module` must be
supplied together; a requested external SUT never silently falls back to synthetic
state processing.

See [execution modes](./execution-modes.md) for the distinction between model, SUT, and PTY guarantees.

The production SUT is intentionally external. In particular, `pi-agents`
is not copied, bundled, imported as a build-time dependency, or shipped by
this package. Integration tests use `PI_UI_LAB_SUT_EXTENSION` and
`PI_UI_LAB_SUT_MODULE` when those environment variables are set and skip when
they are absent.

For the preserved `pi-agents` integration test on this host:

```bash
PI_UI_LAB_SUT_EXTENSION=/Users/applesucks/dev/pi-agents/src/subagent.ts \
PI_UI_LAB_SUT_MODULE=/Users/applesucks/dev/pi-agents/src/subagent.ts \
npm exec vitest -- run src/__tests__/sut-adapter.test.ts
```

The pi-subagentura materializer is the only adapter that knows the artifact/state
file formats. A scoped runtime controller is installed before harness activation: it
captures production `setInterval` registrations, advances their schedule only after
fixture materialization, and restores `Date.now`, timer globals, and captured handles
in `finally`. Session rehydration is dispatched through the registered production
`session_start` handler; normal poll events never invoke test-access exports directly.
This makes production 30-second waiting and 90-second stale labels deterministic
without recreating those rules in pi-ui-lab.

## PTY conformance

`runPiPty` also accepts `externalSut: { extensionPath, modulePath }`. Both paths
are required and are passed to a test-only bridge through the child environment;
there is no default or hard-coded `pi-agents` location. The bridge dynamically
loads the external extension, materializes the requested fixture in an isolated
sandbox, and drives the production rehydration and polling exports. The resulting
PTY text therefore comes from the external production renderer rather than the
synthetic `/ui-lab` widget.

Run the 60- and 100-column PTY checks with the same explicit environment paths:

```bash
npm run build
PI_UI_LAB_SUT_EXTENSION=/Users/applesucks/dev/pi-agents/src/subagent.ts \
PI_UI_LAB_SUT_MODULE=/Users/applesucks/dev/pi-agents/src/subagent.ts \
npm exec vitest -- run src/__tests__/node-pty-runner.test.ts
```

The activity-widget path may still require a live tmux/zellij pane when that is a
production liveness condition. Completion and failure notification fixtures remain
usable without a live child pane.
