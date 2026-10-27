# Test Driven Development

Lecture site for Code Platoon Phase I, **Fundamentals: Test Driven Development**: Red-Green-Refactor with pytest, then Jest, and running test suites in Docker the way CI does. Code along: students type every file in their own VS Code.

**Live site:** https://kabeier.github.io/intro-tdd/

## Lecture 1: Intro to TDD with pytest (~40 min, 15 slides)

- **Slides:** `lecture-1-intro-to-tdd-w-pytest/slides.html`
- **Code lab:** `lecture-1-intro-to-tdd-w-pytest/code-lab/`
- **Activity:** `lecture-1-intro-to-tdd-w-pytest/activity-pass-fail-not-found/`

## Lecture 2: TDD with Jest (~40 min, 14 slides)

- **Slides:** `lecture-2-tdd-w-jest/slides.html`
- **Code lab:** `lecture-2-tdd-w-jest/code-lab/`
- **Activity:** `lecture-2-tdd-w-jest/activity-pass-fail-skipped/`

## The codepad

`shared/codepad.js` + `shared/codepad.css`: VS Code on the code slides. Monaco editor (jsDelivr) plus a terminal you type into: `pytest` is real pytest 8.1 on Pyodide; `npm test` / `npx jest` is a Jest-compatible runner checked line by line against real Jest 30; `node` supports `require` between files; `echo $?` shows exit codes. Ctrl+S saves (the terminal runs the saved file), Ctrl+C stops a program. **N** / **R** type prepared chunks and commands as a backup.

## Instructor kit

- `demo-kit/RUNBOOK.md`: codepad keys, per-slide Do/Say, time checks
- `demo-kit/prompts.md`: every file and command, the Docker demos, the homework's Claude prompt
- `demo-kit/tdd-pytest/` · `demo-kit/tdd-jest/`: the finished lecture folders, with the lessons' Dockerfiles

## Diagrams

`diagrams/*.png` with editable `.tldr` sources (open in tldraw.com).

## Deck keys

→ / Space next · ← back · **P** presenter window (notes with TYPE THIS code, timer, codepad buttons) · **T** clock · **O** overview · **F** fullscreen · **N** / **R** on code slides · click a diagram to zoom
