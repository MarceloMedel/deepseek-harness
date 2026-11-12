
## Installed location in this deployment

- Renderer: `/opt/mdl/archify/bin/archify.mjs`, run with `node` — for example `node /opt/mdl/archify/bin/archify.mjs finalize architecture candidate.json diagram.html`. `/usr/local/bin/archify` is the same entry point on `PATH`.
- This file is the installed skill: `/data/dsh/skills/archify/SKILL.md`. Every resource named below resolves from here — `references/`, `schemas/`, `examples/`, `recipes/`, `assets/`.
- Version 3.2.0, commit `208acba8d412335185b2056fedf54b3405df43fb`.

Author artifacts inside the session workspace: the `.archify/<type>-<slug>-<YYYYMMDD-HHMMSS>/` folder and the delivered HTML both belong there, so the HTML viewer can open the page afterwards.

`browser-check` cannot run in this deployment. The image ships no Chrome or Chromium and none can be downloaded here. `finalize` reports `gates.browser-check: skipped` with the `viewer/chrome-unavailable` diagnostic and exits non-zero. That result is not a defect in the candidate: do not install or download a browser, do not rerun the same command expecting a different result, and do not claim visual review. Deliver the artifact and report visual review as pending.
