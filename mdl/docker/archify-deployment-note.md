
## Installed location in this deployment

- Renderer: `/opt/mdl/archify/bin/archify.mjs`, run with `node` — for example `node /opt/mdl/archify/bin/archify.mjs finalize architecture candidate.json diagram.html`. `/usr/local/bin/archify` is the same entry point on `PATH`.
- This file is the installed skill: `/data/dsh/skills/archify/SKILL.md`. Every resource named below resolves from here — `references/`, `schemas/`, `examples/`, `recipes/`, `assets/`.
- Version 3.2.0, commit `208acba8d412335185b2056fedf54b3405df43fb`.

Author artifacts inside the session workspace: the `.archify/<type>-<slug>-<YYYYMMDD-HHMMSS>/` folder and the delivered HTML both belong there, so the HTML viewer can open the page afterwards.

`browser-check` runs here: the image ships Chromium and `ARCHIFY_CHROME` already points at the wrapper this deployment installs, so `finalize` reaches all four gates and a passing receipt means the visual gate passed. Never install or download a browser yourself, and never pass browser flags: the wrapper exists because the two things this container needs — a writable `HOME` and `--disable-dev-shm-usage` — are not flags you can add. If a receipt does report `viewer/chrome-unavailable` or `browser-check-runtime`, deliver the artifact, report visual review as pending, and say which diagnostic appeared instead of substituting another browser.
