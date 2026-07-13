# External production SUT adapter

`PiHarnessSutAdapter` runs a production extension through the optional
`@gaodes/pi-test-harness` boundary. Supply explicit paths; in-process
synthetic replay remains the default:

```bash
pi-ui-lab test fixtures/*.json \
  --sut-extension /path/to/extension.ts \
  --sut-module /path/to/extension.ts \
  --sut-cwd /tmp/ui-lab-sandbox
```

The adapter materializes fixture artifact and state inputs on disk, invokes
exported rehydrate/poll hooks, and observes real `setStatus`, `setWidget`, and
notification calls. `--sut-extension` and `--sut-module` must be supplied
together; a requested external SUT never silently falls back to synthetic
state processing.

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
file formats. It rehydrates after artifact/reload inputs, runs the production
poller, and records the resulting calls. Frames therefore expose production
running/idle/stale status, widget rows, completion/error notifications, persisted
cursors, and artifact events. Duplicate polls do not create duplicate terminal
notifications. Waiting/stale labels depend on the external process clock and pane
liveness; the adapter does not recreate those production rules.
