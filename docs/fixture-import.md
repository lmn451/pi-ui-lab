# Fixture import command

The `pi-ui-lab fixture import` command converts recorded Pi artifacts into a portable fixture bundle.

## Usage

```bash
pi-ui-lab fixture import --session <session.jsonl> --state <state.json> --artifacts <artifacts-dir> --output <dir>
```

You can also provide inputs as positional arguments instead of option flags:

```bash
pi-ui-lab fixture import session.jsonl state.ndjson state.json artifacts-dir --output <dir>
```

## Inputs

- `--session <path>`: input session JSONL file
- `--events <path>`: input events NDJSON file
- `--state <path>`: input state JSON file
- `--artifacts <directory>`: source artifact directory to copy
- `--output <directory>`: destination fixture directory (required)

At least one input source is required.

## Output

The command writes two files into `--output`:

- `fixture.json`: the normalized, sorted fixture timeline
- `import-manifest.json`: metadata for reproducibility and auditability

The CLI prints both fixture and manifest paths when the import succeeds.

## Import manifest format

`import-manifest.json` includes:

- `version`: manifest format version (currently `1`)
- `generatedAt`: ISO timestamp for when the import ran
- `fixturePath`: path to the generated `fixture.json`
- `fixtureHash`: SHA-256 hash of the fixture file contents
- `inputSources`: list of source files used for the import
  - `kind`: one of `session`, `events`, `state`, or `artifacts`
  - `path`: absolute path to the input source
  - `hash`: sha256 of file sources
  - `fileCount`: number of copied artifact files
- `redaction`: redaction summary applied to fixture payloads
  - `enabledSecretRedaction`
  - `enabledPathRedaction`
  - `secretReplacements`
  - `pathReplacements`
  - `totalReplacements`
  - `applied`

Example:

```json
{
  "version": 1,
  "generatedAt": "2026-07-21T05:56:02.123Z",
  "fixturePath": "/tmp/fixture/fixture.json",
  "fixtureHash": "3a1f...",
  "inputSources": [
    { "kind": "session", "path": "/tmp/session.jsonl", "hash": "6d..." },
    { "kind": "state", "path": "/tmp/state.json", "hash": "c1..." },
    { "kind": "artifacts", "path": "/tmp/artifacts", "fileCount": 4 }
  ],
  "redaction": {
    "enabledSecretRedaction": true,
    "enabledPathRedaction": true,
    "secretReplacements": 2,
    "pathReplacements": 1,
    "totalReplacements": 3,
    "applied": true
  }
}
```

## Safety notes

- Input source files are never modified by import.
- Artifact directories with symbolic links are rejected.
- Output cannot overlap or contain source paths; this avoids circular copy and accidental source overwrite.
- Sensitive values and absolute filesystem paths are redacted by default.
