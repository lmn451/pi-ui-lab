# Pi `ui-lab` extension

This package ships an optional Pi extension entrypoint. The core replay runtime
stays independent of Pi; the extension imports only public types from
`@earendil-works/pi-coding-agent@0.80.6` and delegates execution to
`createUiLabCommand()`.

## Install and load

Install the package in the project that owns the extension:

```bash
npm install --save-dev @earendil-works/pi-coding-agent@0.80.6
npm install pi-ui-lab
```

Build this package, then load its exported extension file with Pi's documented
extension flag:

```bash
npm run build
pi -e ./node_modules/pi-ui-lab/dist/pi-extension/index.js
```

The command is registered as `ui-lab` (Pi displays it as `/ui-lab`). Use it in
Pi with a fixture path and optional flags:

```text
/ui-lab fixtures/sample.json
/ui-lab fixtures/sample.json --action replay --at 500
/ui-lab fixtures/sample.json --checkpoint ready --cols 100 --rows 30 --theme light
```

Relative fixture paths resolve against Pi's documented `ctx.cwd`, not the
extension's installation directory. Arguments are parsed as values; no shell
or command execution is involved.

## Behavior and limitations

`inspect` is the default action and presents a short result summary through
Pi's documented `ctx.ui.notify()` and `ctx.ui.setWidget()` APIs. `replay`
presents frame and checkpoint counts. The bridge owns the replay session and
disposes it after every command. It does not duplicate replay logic, use
private Pi imports, require a model, or create a tmux/Pi process.

Supported options are `--action inspect|replay`, `--at <non-negative number>`,
`--checkpoint <name>`, `--cols <positive integer>`, `--rows <positive integer>`,
and `--theme <name>`. Unknown options and malformed values fail explicitly.

The Pi package is optional and isolated from the core runtime. `doctor` reports
Pi as absent, importable, or compatible; importability alone is not treated as
extension compatibility. `node-pty` is an optional dependency. `npm install` runs
`prepare:node-pty`, which validates the local platform/architecture helper and
adds executable permission without following symlinks or paths outside that
package. The PTY report performs a bounded spawn/output/exit probe and distinguishes
absent, broken, and operational backends. PTY replay launches the built extension
in a real PTY and sends `/ui-lab` interactively; it never falls back to in-process
execution. Use `pi-ui-lab doctor --require pi` or `--require pty` when a workflow
needs a verified capability.
