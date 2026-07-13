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

`inspect` is the default action. In Pi TUI mode it opens the same interactive
inspector used by `pi-ui-lab inspect <fixture>`; non-TUI modes retain the concise
widget/notification summary. `replay` presents frame and checkpoint counts. The
bridge owns and disposes each replay session, uses only public Pi APIs, and does
not create a tmux/Pi process.

Supported options are `--action inspect|replay`, `--at <non-negative number>`,
`--checkpoint <name>`, `--cols <positive integer>`, `--rows <positive integer>`,
and `--theme <name>`. Unknown options and malformed values fail explicitly.

## Inspector controls

`pi-ui-lab inspect <fixture>` opens the inspector when stdin and stdout are TTYs;
use `--non-interactive` (or a pipe) for deterministic text output. `/ui-lab` opens
the same inspector in Pi TUI mode. The controls are:

```text
←/b previous frame     →/n next frame       space play/pause
w cycle viewport width t cycle theme         j jump (ms or checkpoint:name)
/ search agent/event/notification            g save SVG    i save PNG
q or Escape close
```

Every panel line is truncated to the active terminal width. Saved images use
`inspector-frame-<index>.svg` or `.png` in the current working directory.

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
