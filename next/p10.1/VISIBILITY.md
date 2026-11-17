# VISIBILITY

This repository is public, and so is its history. This file says what goes public and what never does.
Written before the first `feat/nashua` commit (2026-11-10). It binds every commit, every Pages push and every export.

## Public (committed, published at /next/)

- Engine code: `src/`, `tools/`, `tests/`, `index.html`, `output.html`, `palettes.json`, `launch/`.
- The **existing-conditions** data pack, `data/nashua/existing/`: per-station terrain skylines, water surface,
  bed, channel width, buildings as massing boxes, bridges, the dam, CSOs, outfalls, the lot, station ranges, the
  named water levels. Derived numbers only, at 2 m and 10 m station spacing.
- Docs and review sheets built from the existing-conditions pack and the procedural worlds.

## Never public without the owner's yes

| What | Where it lives instead |
| --- | --- |
| Design layers: the landform sequence, interventions, walk, plants, observatories, station studies | `data/local/nashua/design/` (gitignored) |
| Raw grids, DEMs, source GIS, contour files | read in place from their source folder, never copied |
| Source paths and file names of the source folder | `tools/nashua/sources.local.json` (gitignored) |
| Video, archival media, webcam captures, screen captures | `media/` (gitignored) and local folders only |
| Anything copied verbatim from the course folder | nowhere in this repo |

Publishing the design pack, or promoting `/next/` to the site root, is the owner's call.

## Rules

- No password, lock, encryption or auth gate, anywhere. `noindex` meta on every page.
- Gate grep (`tools/privacy.mjs`: personal names, personal email, school and course ids, local user paths) on every
  tracked file and on the built preview before every push, zero hits. Third-party license headers inside `vendor/`
  are exempt and listed by the gate; binary images are checked in their metadata, not their compressed bytes.
- Commits use the GitHub noreply address.
- Stage by explicit file list, never by folder.

## Known, not fixable here

- Every commit on `main` before this branch carries a personal email as author and committer. Rewriting public
  history needs a force push, which this build never does. Listed for the owner in the checkpoint.
