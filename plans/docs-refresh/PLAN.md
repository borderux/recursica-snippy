# docs-refresh

## Goal

Make the repo's root docs match the project as it is now, and rewrite ARCHITECTURE.md.

## Requirements (agreed with Matt, 2026-11-01)

- Rewrite the existing ARCHITECTURE.md to describe the project as it is today (decision from Matt).
- Update README.md, AGENTS.md and llms.txt where they are out of date.
- The untracked overseer-agent/ folder was removed at Matt's request. It is not documented.
- Input: the review report on task fdd80662955b1bdcc7c22b71595e868310569dc0e3998c1a346f1c6c2a254506 (read it with `task.mjs get`). Every claim in it should be re-checked against src/ before it goes into a doc.

## Split

1. ARCHITECTURE.md rewrite: architect (only file it may edit).
2. README.md, AGENTS.md, llms.txt fixes: overseer (repo-root files).
3. Out of scope, flagged to Matt: the stale "see theme.ts" comment in vite.config.mts:26 (not a root doc, belongs to the code).

## ARCHITECTURE.md requirements

- Describe the current project only. Remove "round N" change-history narrative and past-tense notes about removed things. If history is worth keeping, say what "round" means and where it is recorded.
- Keep the headings "Adapter workarounds" and "Data model": AGENTS.md references them by name.
- Data model must show the complete shape in src/content/lib/types.ts (ReviewComment: screenshotScale, screenshotClean, annotations, context; session: environment).
- Intro matches the product: text comments, screenshots, page elements and annotations.
- Manifests: say they differ in the background block and in the Firefox gecko id.
- Add a release/CI section (workflows, Changesets, scripts/package-extension.mjs, zip names).
- Fix markdown shape (long wrapped bullets, mis-indented lists, split lists) and give the sections a sensible order.

## README.md, AGENTS.md, llms.txt requirements

- Fix the manifest-difference statements (README Build section, llms.txt).
- Fix the garbled llms.txt line about the data model and styling model.
- Match the product description to the manifest description in all three.
- llms.txt Layout: add scripts/package-extension.mjs, scripts/lint-staged.config.cjs, src/icons/, eslint.config.mjs, .husky/, .prettierignore, src/content/lib modules.
- README Development: add `npm run package-extension`.
- AGENTS.md: state that a changeset is required for each user-facing change, and that CI runs the build and that the build runs lint.

## Acceptance criteria

- Every factual error in the review report is fixed or recorded as not an error, with evidence.
- Every statement in the changed docs was checked against the code.
- No code files changed. Only ARCHITECTURE.md, README.md, AGENTS.md and llms.txt, plus plans/.
- Each change is committed on branch task/docs-refresh; nothing is pushed or merged.

## Libraries

None.
