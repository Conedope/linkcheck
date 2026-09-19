# linkcheck

An offline Markdown link checker that verifies **local filesystem targets** only.
No network requests are ever made — external `http(s)`/`ftp` links are reported as
*external, skipped* unless you opt into `--strict-external`.

Zero npm dependencies. Node.js >= 18.

## Headline feature: code is not content

Links inside **fenced code blocks** and **indented code blocks** are ignored —
they are code, not markdown. HTML comments are ignored too:

````md
[real link](docs/guide.md)        <- checked

```js
[this is code](not-a-real.md)     <- ignored (fenced)
```

    [also code](not-a-real.md)    <- ignored (indented)

<!-- [hidden](not-a-real.md) -->  <- ignored (HTML comment)
````

## Install / run

```bash
npm install -g .     # optional; or run directly
linkcheck .          # scan current directory
node bin/linkcheck.js docs/  # run without installing
```

## Usage

```
linkcheck [PATH...] [options]
linkcheck --files MARKDOWN.md [MORE.md...]
```

| Argument | Description |
| --- | --- |
| `PATH` | file or directory (`.md` / `.markdown`, walked recursively) |
| `--files PATH...` | explicit Markdown files to check |
| `--strict-external` | treat external links as failures instead of skipping them |
| `--json` | emit a JSON array of per-link results on stdout |
| `--no-color` | disable ANSI colors |
| `--version`, `-v` | print the version and exit |
| `--help`, `-h` | show help and exit |

### Example output

```bash
$ linkcheck . --no-color
index.md:3 missing.md -> not found: missing.md
4 links, 2 ok, 1 broken, 1 external (skipped)
```

Under `--json`, the same run prints an array of objects:

```json
[
  {
    "sourceFile": "/repo/index.md",
    "line": 3,
    "type": "inline",
    "text": "missing",
    "target": "missing.md",
    "anchor": null,
    "status": "missing",
    "reason": "not found: missing.md",
    "note": null,
    "found": null
  }
]
```

### What is checked

- Inline links `[text](path)`, images `![alt](path)`, and reference-style links
  `[text][ref]` (with `[ref]: path` definitions; dangling references are broken).
- Targets relative to their source file, including `../` traversal and
  directory targets.
- Percent-encoded targets (`my%20file.md` → `my file.md`) are decoded first.
- Case-insensitive fallback: if a byte-exact check misses, the containing
  directories are listed to find a case-mismatched match. A match is reported
  as `ok` with `note: "case"` (and the actual spelling); a real miss stays
  `missing`.

### What is not checked

- **Anchors are never verified.** A link's `#fragment` is stripped for the
  filesystem check and reported in the result (`anchor`), but the heading it
  points to is not validated.
- External URLs are never contacted (pure offline).

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no broken links found (external links are skipped) |
| `1` | one or more broken links, or an external link under `--strict-external` |
| `2` | usage error or I/O error |

## Development

```bash
npm test        # node --test test/*.test.js (offline only)
```

## License

MIT © 2026 Conedope