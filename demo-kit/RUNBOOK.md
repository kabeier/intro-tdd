# Live demo runbook: Test Driven Development, code along

**The story:** both lectures are code along. Students type every file in **their own VS Code** and run the tests in **their own terminal**. You present from the slides: each code slide is a real editor (Monaco) with a terminal where you type `pytest` / `npm test`, and the tests really run. No app, no Claude prompt.
- **Lecture 1 (Intro to TDD with pytest):** Red-Green-Refactor, test discovery, reading output and exit codes, assertions, monkeypatch, capsys, pytest in Docker. Folder: `tdd-pytest/`.
- **Lecture 2 (TDD with Jest):** module.exports/require, npm + Jest setup, first spec, reading Jest output, describe/xtest/xdescribe, Jest in Docker, CI/CD. Folder: `tdd-jest/`.

## The codepad (every "Code along" slide)

It's **Monaco, the editor inside VS Code**, plus a terminal you type into. Work in it exactly like VS Code:

| Do | How |
|---|---|
| Type code | Click in the editor. Autocomplete, hovers, Ctrl+/ comments, Ctrl+Z, multi-cursor all work |
| Save | **Ctrl+S**. ● on the tab = unsaved. **The terminal runs the saved file**, like real VS Code (show this once: it's the #1 student bug) |
| Run | Click the terminal, type the command: `pytest test_example.py`, `pytest -v …`, `npm test`, `node runner.js`. Or **Ctrl+Enter** in the editor (saves + runs that file's command) |
| Read another file | Click it in the **Explorer** (e.g. `example.py` from the last slide, `package.json`): it opens **read-only**. × or **Esc** closes it |
| Stop a program | Click the terminal, **Ctrl+C** (auto-stops after 20 s if you forget) |
| Terminal extras | ↑ ↓ history · Tab completes file names · `echo $?` (exit code) · `ls`, `cat file`, `clear` · `npm init -y` writes package.json · `npm install` / `pip install` print a note (nothing to download here) · `docker` → run it in your own terminal |
| Leave the editor | **Esc**, so → / ← change slides again (keys typed in the terminal never change slides) |
| Backup: prepared code | **N** types the next prepared chunk (and saves). **R** types `node …` / `python3 …` into each terminal and runs. **All** = finished code, **Reset** = start over |
| Presenter window (**P**) | Shows the next prepared chunk + Type next / Run / Show all / Reset buttons |

- **Type from your notes:** every code slide's presenter notes (**P**) have a **TYPE THIS** block: each chunk in order, with its file. The slide editor does **not** auto-indent or auto-close brackets, so typing it exactly as written (spaces included) comes out exactly right. Enter is always a new line; **Tab** accepts an autocomplete suggestion. Click a block once to select it all, if you'd rather copy and paste. (Tell students: *their* VS Code adds the closing `}` and the indent for them.)
- **Real output:** pytest is **real pytest 8.1** running in the browser (Pyodide); its platform line says `emscripten`. `npm test` / `npx jest` run a Jest-compatible runner whose output was checked line by line against **real Jest 30** after every step of every slide (also `node`). Exit codes match too.
- **Needs internet the first time:** Monaco (~3 MB), Python (~10 MB) and pytest (~1 MB, loaded on the first `pytest`) come from a CDN, then the browser caches them. Without internet, a simpler built-in editor appears, and Python shows the recorded output for the slide's code.
- **Earlier files exist:** in the terminal, `node example.js` works on any later slide, like real files in the folder.

## Setup (once, before Lecture 1)

```bash
pip install pytest && pytest --version          # 8.x
node --version                                    # 18+
docker pull python:3.11-slim && docker pull node:18-alpine   # for the two Docker demos
```
- Open both decks once in **Chrome** with internet on (editor, Python and pytest get cached; run one `pytest` on a code slide).
- Tabs: the deck, the Code Lab, the activity.
- The finished folders, with Dockerfiles: `demo-kit/tdd-pytest/` and `demo-kit/tdd-jest/`.

## Dry run (the night before), then reset

1. Present each deck with **P**. On each code slide type (or **N**) and run each step: you should see red, then green, as the notes say.
2. Try both Docker demos in your real terminal from a copy of `demo-kit/tdd-pytest/` and `demo-kit/tdd-jest/`.
3. Reset: reload the deck (every code slide starts fresh). Delete your practice folders.

## Lecture 1 in class (Intro to TDD with pytest)

| Slide (~min) | Where | Do | Say |
|---|---|---|---|
| 1 (0) | Deck | Press **T**. Students: `mkdir tdd-pytest`, `cd tdd-pytest`, `code .` | "Today the test comes first." |
| 2 (1) | Deck | Ask how they debugged a `false` | "A real framework tells you the line and the values." |
| 3–4 (3–5) | Deck | Red-Green-Refactor, why TDD | "If you never saw it fail, it might not catch anything." |
| 5 (7) | Your terminal | `pip install pytest`, `pytest --version` | "Thumbs up when you see pytest 8." |
| 6 (9) | Deck | How pytest finds tests | "Wrong name = the test silently isn't there." |
| 7 (10) | Codepad | Type the test, run → **red** (ImportError), `echo $?` → 2. Type the function, run → **green**, `echo $?` → 0. Refactor, run → still green | "Red, green, refactor. That's the whole method." |
| 8 (17) | Deck | Reading the output | "Dot, F, E. And the exit code is for computers." |
| 9 (18) | Activity page | 6 cards | "PASS, FAIL or NOT FOUND in chat on go." |
| 10 (24) | Codepad | Type both files, `pytest -v …` → one red ("jam"). Read it. Remove "jam", save, run → green | "pytest shows you the values. Read the E lines." |
| 11 (30) | Codepad | monkeypatch + capsys, `pytest -v …` | "Name the fixture as a parameter, pytest hands it to you." |
| 12 (35) | Your terminal | `docker build -t pytest-tests .`, `docker run --rm pytest-tests`, `echo $?` (from a copy of demo-kit/tdd-pytest/) | "Same tests, same Python, on every machine." |
| 13 (38) | Deck | Homework | "Run the tests before you write code." |

**Time check, Lecture 1:**
- **Not at the activity (slide 9) by ~min 20:** skip the refactor step on slide 7 (say it, don't type it).
- **Not at slide 11 by ~min 32:** press **All** on slide 11 and run once; students do it from Code Lab 1.
- **pytest install trouble for many students:** "Watch my screen; `python3 -m pip install pytest` and `python3 -m pytest` work without PATH changes; Code Lab 1 has the table."

## Lecture 2 in class (TDD with Jest)

| Slide (~min) | Where | Do | Say |
|---|---|---|---|
| 1 (0) | Deck | Press **T**. Students: `mkdir tdd-jest`, `cd tdd-jest`, `code .` | "Same TDD, JavaScript." |
| 2 (1) | Deck | Python import vs JS | "A JS file shares nothing until you export it." |
| 3 (3) | Codepad | factorial.js, runner.js, `node runner.js` → ReferenceError; add export → still error; add require → 24 | "Export sends it, require brings it in. You need both." |
| 4 (8) | Deck | Exports diagram (several things = an object) | "Forget the export: 'factorial is not a function'." |
| 5 (9) | Codepad | `npm init -y`, change the test script, `npm install --save-dev jest`, `npm test` → No tests found | "Correct: we haven't written one." |
| 6 (13) | Deck | pytest vs Jest table | "test() takes a description and a callback." |
| 7 (14) | Codepad | Type the spec, `npm test` → PASS. 24→23 → FAIL, `echo $?` → 1. Back → PASS | "Expected is what you wrote, Received is what the code did." |
| 8 (19) | Deck | Reading Jest | "Read Expected and Received first." |
| 9 (20) | Activity page | 6 cards | "toBe or toEqual: same thing, or same contents?" |
| 10 (26) | Codepad | Paste the grouped spec (or N), run; xtest; xdescribe | "Skip to focus. Don't commit skips by accident." |
| 11 (32) | Your terminal | From a copy of demo-kit/tdd-jest/ (has .dockerignore): build, run, `echo $?` | "This is exactly what CI does." |
| 12 (35) | Deck | CI pipeline | "The exit code is the gate." |
| 13 (37) | Deck | Homework | "`npm install` first in the Jest repos." |

**Time check, Lecture 2:**
- **Not at the activity (slide 9) by ~min 22:** on slide 5, press **N** for the script edit and skip the "No tests found" run.
- **Not at slide 11 by ~min 34:** show the Dockerfile and say what it does; students try it from Code Lab 2.
