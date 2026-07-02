---
name: html-over-md
description: >-
  Produce a polished, self-contained HTML page instead of a Markdown file
  whenever creating a document whose audience is the user — reports, research
  write-ups, analyses, comparisons, audits, summaries, how-to guides, project
  write-ups. Use this whenever you are about to Write a .md file for the user
  to read, or the user asks for a "doc", "report", "summary", "write-up", or
  "notes" without naming a format — even if another skill's instructions say to
  produce a Markdown report. Does NOT apply to Markdown that tools or
  conventions consume: README.md, CLAUDE.md, SKILL.md, plan files, PR/issue
  bodies, changelogs, or docs/ files meant to be read on GitHub.
---

# HTML pages instead of Markdown files

The user finds raw Markdown files hard to read — a `.md` file in an editor is
a wall of monospaced text with literal `#` and `|` characters. A styled HTML
page opened in the browser is dramatically easier for them to scan and read.
So: when the deliverable is a _document for the user to read_, write it as a
single self-contained `.html` file and open it in the browser.

## When this applies — and when it doesn't

Apply it when the file's only job is to be read by the user:

- research reports, investigation write-ups, architecture explanations
- comparisons, audits, reviews, decision docs
- summaries, guides, notes the user asked you to write down

Do **not** convert Markdown that something else consumes. These stay `.md`:

- `README.md`, `CLAUDE.md`, `SKILL.md`, `CONTRIBUTING.md` and other
  convention-named files
- plan files, eval files, or anything a tool/harness reads back
- files committed to a repo's `docs/` to be rendered by GitHub
- commit messages, PR descriptions, issue text

If another skill (e.g. a research skill) says "write a Markdown report", keep
that skill's _content and structure_ but emit the report as HTML. If a tool
genuinely requires the `.md` artifact too, write both and point the user at
the HTML one.

## How to build the page

Start from `assets/template.html` (read it, then adapt). Rules that make the
page actually pleasant:

1. **One self-contained file.** All CSS inline in a `<style>` block. No CDN
   links, no external fonts, no JS frameworks — the page must render offline
   and survive being moved around. Plain vanilla `<script>` only if the
   document truly benefits (e.g. collapsible sections); most don't need any.
2. **Save it where the .md would have gone**, same basename, `.html`
   extension. If there's no natural location, use the project root or the
   directory the user is working in — not a temp dir they'll lose.
3. **Structure beats decoration.** Use real headings (`h1`–`h3`), short
   paragraphs, tables for enumerable facts, `<code>`/`<pre>` for code and
   paths. A small table of contents when there are 4+ sections.
4. **Respect the reader's eyes.** The template already handles this: readable
   measure (~72ch), system font stack, generous line height, styled tables
   and code blocks, automatic dark mode via `prefers-color-scheme`. Keep it.
5. **Open it when done**: `open <file>.html` (macOS). Then tell the user the
   path in your summary.

Content guidance is unchanged from good writing anywhere: lead with the
conclusion, keep sections scannable, spell out file paths as clickable
`<code>` spans.
