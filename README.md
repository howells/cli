# @howells/cli

Agent-first CLI harness — structured JSON output, arg parsing, input hardening, and field filtering.

The shared foundation for [`@howells/thingscli`](https://github.com/howells/thingscli), [`@howells/starlingcli`](https://github.com/howells/starlingcli), and [`@howells/linearcli`](https://github.com/howells/linearcli).

## Install

```bash
npm install @howells/cli
```

## Usage

```typescript
import { success, error, filterFields } from "@howells/cli";
import { flag, hasFlag, readJsonInput, getLimit, getFields, readResult } from "@howells/cli/args";
import { hardenId, validateTitle, validatePositiveInt, validateFields } from "@howells/cli/validate";

// Structured JSON output
success({ balance: "£1,481.14" }, "balance");
// → {"ok":true,"data":{"balance":"£1,481.14"},"command":"balance"}

error("No token found.", "balance");
// → {"ok":false,"error":"No token found.","command":"balance"}

// Arg parsing
const team = flag("team");        // --team ENG → "ENG"
const dryRun = hasFlag("dry-run"); // --dry-run → true
const json = readJsonInput("create"); // --json '{"title":"..."}' → parsed object

// Input hardening (defends against agent hallucinations)
hardenId("../../etc/passwd", "issue"); // exits with error
hardenId("ENG-123", "issue");          // passes

// Context window discipline
readResult("issues", data); // applies --fields and --limit automatically
```

## API

### Output (`@howells/cli`)

| Function | Description |
|---|---|
| `success(data, command?, extra?)` | Output JSON success envelope and exit |
| `error(message, command?)` | Output JSON error envelope and exit |
| `filterFields(items, fields?)` | Filter array of objects to specified fields |

### Args (`@howells/cli/args`)

| Function | Description |
|---|---|
| `flag(name)` | Get `--name value` from argv |
| `hasFlag(name)` | Check if `--name` is in argv |
| `getLimit(command)` | Parse and validate `--limit` |
| `getFields(command)` | Parse and validate `--fields` |
| `readJsonInput(command)` | Parse `--json '{...}'` as object |
| `readResult(command, data, extra?)` | Apply --fields + --limit and output |

### Validate (`@howells/cli/validate`)

| Function | Description |
|---|---|
| `hardenId(value, command, options?)` | Reject path traversal, control chars, percent encoding, query params |
| `validateTitle(value, command, maxLength?)` | Reject empty or overly long titles |
| `validatePositiveInt(value, field, command)` | Parse and validate positive integers |
| `validateFields(value, command)` | Validate comma-separated field names |

## Design Principles

Built for the [Agent DX CLI Scale](https://danielhowells.com/posts/rewrite-your-cli-for-ai-agents):

1. **Machine-readable output** — JSON envelope on every path, including errors
2. **Context window discipline** — `--fields` and `--limit` are first-class
3. **Input hardening** — `hardenId()` defends against the specific ways agents fail (hallucinated paths, not typos)
4. **Safety rails** — `readJsonInput()` for raw payload input, `hasFlag("dry-run")` for validation

## License

MIT
