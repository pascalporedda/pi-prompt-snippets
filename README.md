# Prompt Snippets

A [Pi](https://pi.dev) extension for mixing and matching single-purpose prompt
rules. You toggle snippets on, and Pi adds them before or after your message
when you send it. Unlike skills, each snippet is one short instruction, so you
pick exactly the ones you want for each message.

## Install

```bash
pi install git:github.com/pascalporedda/pi-prompt-snippets
```

Pin a tag or commit with `@<ref>`, for example
`pi install git:github.com/pascalporedda/pi-prompt-snippets@v0.1.0`. Add
`--local` (`-l`) to write the package to project settings instead of personal
settings. To try it for one run without installing:

```bash
pi -e git:github.com/pascalporedda/pi-prompt-snippets
```

Remove it with `pi remove git:github.com/pascalporedda/pi-prompt-snippets`.

If you already have a copy of this extension in your Pi extensions directory,
remove that copy first. Otherwise `/snippets` and `alt+s` get registered twice.

## Usage

- Press **alt+s** or run **/snippets** to open the toggle menu.
  - `up`/`down` moves the cursor, `space` toggles a snippet, `enter` applies
    your changes, and `esc` cancels.
  - `tab` previews the highlighted snippet: its name, placement, order,
    filename, and full body. Use `up`/`down` to scroll long bodies. `tab` or
    `esc` goes back to the list and keeps your cursor where it was.
  - The menu has a top and bottom border. If the list is taller than your
    terminal allows, it scrolls and shows `↑ n more` / `↓ n more`.
  - The menu only works in the interactive terminal UI.
- Active snippets show in a widget above the editor:
  - `↑ prepend: ...` (accent color) goes before your message
  - `↓ append: ...` (warning color) goes after your message
- When you send a message, the active snippet bodies are joined with blank
  lines in this order: prepend group (sorted by `order`), then your text, then
  the append group (sorted by `order`).
- All toggles turn **off** after each send and when a session starts.

## Bundled snippets

| Snippet | Placement | Purpose |
|---|---|---|
| Session kickoff | prepend | Get familiar with the project and report back before starting work |
| Orchestrator mode | prepend | Hand mechanical work to subagents and stay high-level |
| Ask questions | append | Ask questions until there is a shared understanding |
| Verify, don't assume | append | Check critical facts instead of guessing |
| Delegate exploration | append | Keep context lean by having subagents explore |
| Diagnose, don't fix | append | Investigate without changing code, then report findings and a proposed fix |
| Break it | append | Prefer breaking changes over legacy compatibility code |

## Snippet files

By default, snippets are loaded from the bundled `snippets/` directory next to
`index.ts`. You can point the extension at your own directory instead (see
below). Each snippet is a markdown file with frontmatter:

```markdown
---
name: Concise
description: Keep answers short and to the point
placement: prepend
order: 10
---
Keep your response concise. Skip preamble and unnecessary explanation.
```

| Field | Required | Notes |
|---|---|---|
| `name` | no | Display name. Defaults to the filename without `.md` |
| `description` | no | Shown next to the name in the toggle menu |
| `placement` | no | `prepend` or `append` (default: `append`) |
| `order` | no | Number that sorts snippets within their group, both in the menu and in the sent text (default: `9999`, ties sorted by name) |

Files without a frontmatter block or with an empty body are skipped. Pi
re-reads the files every time you open the menu and every time you send a
message, so edits take effect right away with no `/reload`.

## Use your own snippets directory

To use your own snippets, create `prompt-snippets.json` in Pi's agent
directory. That is `~/.pi/agent/prompt-snippets.json` by default, or
`$PI_CODING_AGENT_DIR/prompt-snippets.json` if you have set
`PI_CODING_AGENT_DIR`:

```json
{
  "snippetsDir": "~/pi-snippets"
}
```

- When `snippetsDir` is set, that directory **replaces** the bundled snippets.
  The two sets are not merged. Copy any bundled files you want to keep from
  `snippets/` into your directory.
- If the config file doesn't exist, or doesn't set `snippetsDir`, the bundled
  snippets are used.
- `snippetsDir` can be an absolute path, a path starting with `~/`, or a
  relative path. Relative paths resolve against the directory that contains
  `prompt-snippets.json`.
- The config is read when a session starts, and again on `/reload`, a new
  session, or a resumed session. Changes to snippet files in the directory
  take effect right away, just like the bundled ones.
- Configuration problems are reported as errors. They never silently fall
  back to the bundled snippets. This covers:
  - a config file that can't be read
  - invalid JSON, or JSON that isn't an object
  - unknown keys, such as a misspelled `snippetDir`
  - a `snippetsDir` that is empty or not a string
  - a configured directory that doesn't exist or isn't a directory

  The extension never creates the configured directory. While the config is
  broken, the menu shows the error instead of opening, and messages are sent
  unchanged.

Keeping your snippets outside the package means package updates can't touch
them. Don't edit files inside a `git:` install: Pi manages that checkout, and
`pi update --extensions` or package reconciliation can reset or overwrite it,
so **you can lose any snippets you add or edit there.** If you want to change
the extension code itself, fork or clone this repository and install it from
a local path. Pi loads local packages in place without copying them:

```bash
git clone https://github.com/pascalporedda/pi-prompt-snippets
pi install ./pi-prompt-snippets
```

## Development

Requires Node.js 22.18 or newer, which runs TypeScript directly.

```bash
npm install
npm run check   # tsc --noEmit + node --test
pi -e .         # load this checkout for one session
```

The tests drive the real extension through a fake Pi API. They cover menu
navigation, preview, toggling, prompt transformation, the reset behavior,
`prompt-snippets.json` resolution and errors, and frontmatter validation for
the bundled snippets. Each test points `PI_CODING_AGENT_DIR` at a fresh
temporary directory, so your real Pi configuration is never read.

`@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui` come from Pi at
runtime. They are declared as `peerDependencies` with a `*` range and pinned in
`devDependencies` only for type checking and tests. Pi does not install
either kind for managed packages.

## License

[MIT](LICENSE) © Pascal Poredda
