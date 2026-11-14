---
written_by: AI (Claude Opus 5.5), 2026-11-14, from Josh's steering
---

# AGENTS.md

Josh owns this project. His own words are the authority. They are kept privately in `.agent/` on his machine (ignored by Git) with the build brief; never commit or publish them.

## What it is

A world map of what Apple's hardware costs to take home in each country, US state and Canadian province, from Apple's own online stores, with a share card for X. Live at <https://appleprices.jjpcodes.com> (ChatGPT Sites).

## How it is built

- `proto/` is the data contract: one protobuf price snapshot.
- `tools/` scrapes Apple's store pages and writes the snapshot to `data/`.
- `src/` is what the page and the share card both use: prices, wording, the price line, the card's SVG.
- `web/` is the page; `hosting/` is the Sites Worker that serves it and renders share cards.
- `assets/` holds flags, map outlines and fonts, each written by a tool in `tools/`.

## Rules

- Josh's engineering principles: `~/.claude/skills/engineering/SKILL.md`. Names say what things are; no comments needed.
- First-party data only: prices come from Apple's own store pages. Taxes come from the Tax Foundation (US) and the Canada Revenue Agency.
- Tools come from `devenv shell`.
- Opus or Fable build the frontend. GPT-6.1 Sol never builds frontend or UI.
