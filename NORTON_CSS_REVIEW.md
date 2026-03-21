# Norton CSS / Render Review

## Verdict
This looks **primarily like a layout/rendering bug introduced by the stage-layout redesign**, not a broken Tailwind/CSS build pipeline.

The app still compiles, emits the global stylesheet, and server-rendered HTML contains the expected `mc-*` classes. So the live symptom of a "half unstyled" UI is more likely the new layout overflowing/cropping on Bryan's viewport/device than CSS failing to load at all.

## Ranked root-cause hypotheses

### 1) Fixed-height shell + `body { overflow: hidden }` is clipping the redesign on real screens
**Confidence: high**

The redesign hard-locks the viewport in several places:
- `app/globals.css`
  - `body { overflow: hidden; }`
  - `.mc-shell { height: calc(100vh - 52px); }`
  - `.mc-stage__canvas-wrap { height: calc(100% - 68px); }`
  - `.mc-root { min-height: 100vh; padding: 26px; }`
  - `.mc-frame { grid-template-columns: auto minmax(0, 1fr) 332px; }`

This combination is brittle. On smaller laptop screens, browser zoom, mobile-ish widths, Tailscale-served remote viewing, or any viewport with reduced usable height, large parts of the app can get cropped with no page scroll available. That often gets reported as "broken / half unstyled" because only part of the premium shell is visible and panels look cut off.

### 2) Responsive treatment is incomplete for the new 3-column shell
**Confidence: medium-high**

The redesign assumes a fairly wide desktop viewport. The only breakpoints found are:
- `@media (max-width: 1200px)` → inspector shrinks from 332px to 300px
- `@media (max-width: 960px)` → inspector hides

What is missing:
- no reflow for narrow-but-still-desktop widths where top strip + search + pills overflow
- no vertical fallback when available height is low
- no safer stage sizing based on actual content instead of chained `calc()` heights

This can easily produce a page that looks partially styled because some panels render correctly while others collapse, crop, or disappear.

### 3) The redesign replaced the old simpler shell with a much more fragile CSS architecture
**Confidence: medium**

Commit implicated:
- `1580803 feat: redesign mission control with stage layout and premium UI architecture`

That commit massively rewrote:
- `app/globals.css`
- `app/page.tsx`
- `components/mission-control/MissionControlScreen.tsx`
- `components/mission-control/TopStatusStrip.tsx`
- `components/mission-control/NavRail.tsx`
- `components/mission-control/MissionStage.tsx`
- `components/inspector/InspectorPanel.tsx`
- `components/AgentGraph.tsx`

The prior version was simpler and less viewport-fragile. The breakage lines up with the redesign itself, not with the CSS toolchain.

### 4) Not a Tailwind/postcss/global CSS loading failure
**Confidence: medium-high**

Why I do **not** think the main problem is the styling pipeline:
- `app/layout.tsx` imports `./globals.css` correctly
- production build succeeds: `next build` passes cleanly
- generated HTML links the emitted CSS file
- emitted CSS contains the custom `mc-*` rules from `app/globals.css`
- Tailwind v4/PostCSS config is valid enough to build and emit styles

Files checked:
- `app/layout.tsx`
- `app/globals.css`
- `package.json`
- `postcss.config.mjs`
- `next.config.ts`

So Gorilla should **not** start by debugging Tailwind installation or chasing missing global CSS imports.

## Exact files/components implicated

### Primary
- `app/globals.css`
  - `body { overflow: hidden; }`
  - `.mc-shell { height: calc(100vh - 52px); }`
  - `.mc-frame { grid-template-columns: auto minmax(0, 1fr) 332px; }`
  - `.mc-stage__canvas-wrap { height: calc(100% - 68px); }`
  - limited responsive breakpoints only

### Secondary
- `components/mission-control/MissionControlScreen.tsx`
  - new shell structure (`mc-root` → `mc-shell` → `mc-frame`)
- `components/mission-control/TopStatusStrip.tsx`
  - wide top bar with search + status pills + theme toggle, likely to overflow on tighter widths
- `components/mission-control/MissionStage.tsx`
  - relies on height being available from parent chain
- `components/inspector/InspectorPanel.tsx`
  - fixed third column in desktop layout contributes to cramped center stage

## What Gorilla should change first

### First move: make the shell resilient before touching visuals
1. In `app/globals.css`, remove or relax the hard page lock:
   - change `body { overflow: hidden; }` to allow vertical scrolling, or move overflow control to specific panels only
2. Replace fixed viewport math with flex/min-height-safe sizing:
   - avoid chaining `height: calc(100vh - 52px)` and `height: calc(100% - 68px)` unless every parent height is guaranteed
3. Make the main layout degrade sooner:
   - collapse/hide the inspector earlier
   - let the top strip wrap more aggressively
   - consider switching to a 2-row or stacked layout below a wider breakpoint than 960px
4. Test at common laptop sizes and browser zoom levels before any visual polish

## What not to waste time on
- Do **not** start with Tailwind reinstall / PostCSS surgery
- Do **not** start by redesigning colors, spacing, or components
- Do **not** assume hydration is the main issue; I found no obvious hydration-breaking pattern in the new shell
- Do **not** focus first on `app/layout.tsx` global CSS import; it is already correct

## Classification
- **Primary:** layout bug / responsive shell regression
- **Secondary:** component-level viewport assumptions in the redesigned stage layout
- **Not primary:** styling pipeline failure

## Tiny safe note
I did not apply code changes. The issue is diagnosable, but the correct fix should be done by Gorilla with an actual viewport pass instead of a blind micro-edit.

## Short handoff to Gorilla
The live page is probably not "missing CSS"; the CSS is building and loading. The redesign introduced a brittle full-viewport shell (`overflow: hidden`, fixed `calc()` heights, 3-column desktop layout) that likely crops and breaks on Bryan's actual screen. Fix the shell sizing/responsiveness first in `app/globals.css`, especially body overflow, `mc-shell`, `mc-frame`, and `mc-stage__canvas-wrap`. Ignore Tailwind pipeline debugging unless Gorilla finds the CSS asset truly missing in prod.