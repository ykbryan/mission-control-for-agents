# Omega Implementation Plan — Mission Control Redesign Architecture Packet

## Purpose
This document converts Kat’s redesign brief into a concrete implementation architecture for Gorilla.

This is **not** a design moodboard and **not** a code task. It is the execution packet for rebuilding Mission Control so the product silhouette, hierarchy, and interaction model materially change before Mother UAT.

---

## 1. Executive summary

### Current app shape
The current app is structurally a standard dashboard shell:
- left sidebar = `AgentList`
- center = `AgentGraph`
- right column = `AgentPanel`
- top = thick header with search / mode toggle / agent count

This is reinforced by:
- a hard `content-grid` in `app/page.tsx`
- many equal-weight bordered panels
- graph visuals that read as a widget placed inside a card
- heavy inline styles inside components that prevent system-level redesign

### Required architectural shift
The redesign should move the app from a **3-column dashboard** to a **framed stage layout**:
- **left rail** = narrow sculpted navigation spine
- **center stage** = dominant mission canvas / theatre
- **right inspector** = contextual floating inspector, visually quieter by default
- **top strip** = thin executive status strip, not a traditional app header

### Critical success condition
If Gorilla only “reskins” the current structure, the redesign fails.

The layout silhouette must change **first**.

---

## 2. Existing implementation constraints to address

## Relevant files today
- `app/page.tsx`
- `app/globals.css`
- `components/AgentList.tsx`
- `components/AgentGraph.tsx`
- `components/AgentPanel.tsx`
- `components/SearchBar.tsx`

## Architectural issues in current code
1. **Too much page orchestration in `app/page.tsx`**
   - page owns layout, topbar, sidebar state, selection state, search, dark mode, open files, and view mode
   - this makes layout refactoring harder and encourages monolithic UI changes

2. **Heavy inline styling in major components**
   - `AgentGraph.tsx` and `AgentPanel.tsx` encode visual identity directly in JSX
   - prevents scalable theme, motion, and state styling

3. **Graph component mixes too many concerns**
   - graph layout math
   - visual rendering
   - hover tooltip system
   - workflow mode rendering
   - pan interaction
   - action buttons
   - decorative animation definitions

4. **Inspector behaves as a permanently docked third column**
   - not contextual enough
   - not transformable between overview and focused inspection states

5. **No real surface / layer system**
   - “glass-panel” is the dominant pattern
   - border-first styling is repeated instead of layered material tokens

6. **Light/dark mode is mostly inversion**
   - no shared tone architecture across both themes

---

## 3. Component restructuring plan

## Goal
Break the current page into layout-owned regions and visual systems so Gorilla can redesign the silhouette cleanly without fighting one giant page component.

## Proposed component tree

```text
app/page.tsx
  MissionControlScreen
    MissionControlShell
      TopStatusStrip
      StageFrame
        NavRail
        MissionStage
          StageToolbar
          GraphStage
            GraphCanvas
            StageOverlays
        InspectorPanel
```

## Proposed files / responsibilities

### Screen + orchestration
- `app/page.tsx`
  - render top-level screen only
  - no heavy markup
- `components/mission-control/MissionControlScreen.tsx`
  - page-level state wiring
  - composes shell regions

### Layout shell
- `components/mission-control/MissionControlShell.tsx`
  - framed stage layout
  - outer padding, region sizing, responsive behavior
- `components/mission-control/TopStatusStrip.tsx`
  - thin executive strip
- `components/mission-control/StageFrame.tsx`
  - owns left rail / stage / inspector relationship

### Left rail
- `components/mission-control/NavRail.tsx`
  - primary agent navigation rail
  - collapse/expand behavior
  - top brand anchor + bottom utility cluster
- `components/mission-control/NavRailItem.tsx`
  - icon-first nav item, active state, hover state

### Center stage
- `components/mission-control/MissionStage.tsx`
  - stage wrapper, atmospheric background, inner composition
- `components/mission-control/StageToolbar.tsx`
  - stage-level actions only
  - view toggle, command/search trigger, maybe fit/reset
- `components/mission-control/GraphStage.tsx`
  - stage-specific composition wrapper
  - keeps graph from feeling like a card dropped in the middle
- `components/mission-control/StageOverlays.tsx`
  - quiet helper overlays: legend, minimap, key hints, or path summary
  - only if needed; must stay secondary

### Graph system
- split current `components/AgentGraph.tsx` into:
  - `components/graph/GraphCanvas.tsx`
  - `components/graph/GraphNode.tsx`
  - `components/graph/GraphConnection.tsx`
  - `components/graph/GraphTooltip.tsx`
  - `components/graph/WorkflowStrip.tsx`
  - `components/graph/useGraphLayout.ts`
  - `components/graph/useGraphInteraction.ts`

### Inspector system
- replace monolithic `AgentPanel.tsx` with:
  - `components/inspector/InspectorPanel.tsx`
  - `components/inspector/InspectorOverview.tsx`
  - `components/inspector/InspectorAgentSummary.tsx`
  - `components/inspector/InspectorSkills.tsx`
  - `components/inspector/InspectorFiles.tsx`
  - `components/inspector/FilePreview.tsx`
  - `components/inspector/InspectorActivity.tsx` (optional placeholder for future execution/log state)

### Shared systems
- `components/ui/Surface.tsx`
- `components/ui/IconButton.tsx`
- `components/ui/Pill.tsx`
- `components/ui/SectionLabel.tsx`
- `components/ui/StatChip.tsx`

### Styling organization
- keep `app/globals.css` only for global tokens / reset / app-level primitives
- move mission-control specific styles into either:
  - CSS modules per component, or
  - a small set of co-located style files by region

### Data / state utilities
- `lib/mission-control/view-model.ts`
  - derived values for selected agent, search filtering, inspector content mode
- `lib/mission-control/theme.ts`
  - token definitions if Gorilla wants TS token mapping for reusable values

---

## 4. Layout hierarchy and ownership of each area

## A. Outer shell
**Owner:** `MissionControlShell`

### Responsibilities
- apply generous page padding (target 24–32px desktop)
- establish full-screen framed stage look
- prevent regions from reading like equal cards
- set responsive breakpoints and collapse behavior

### Layout target
Desktop target silhouette:
- left rail: ~72–92px collapsed, ~220–240px expanded only if needed
- center stage: dominant, flexible, ~60–70% visual ownership
- right inspector: ~300–360px default, expandable to ~420px only on deeper inspection
- top strip: thin fixed-height band, ~52–64px total visual footprint

### Rules
- stage must visually dominate even if actual CSS width ratio varies by breakpoint
- no identical rounded box treatment across all 3 columns
- stage should feel embedded in an atmospheric shell, inspector should feel floated over/adjacent to it

---

## B. Top strip
**Owner:** `TopStatusStrip`

### Responsibilities
- show page/workspace identity
- show condensed live system summary
- expose only highest-value controls

### Keep in top strip
- title + subtitle or workspace context
- compact system status summary
- theme toggle
- command/search trigger
- profile/settings or overflow

### Remove from top strip
- oversized branding block
- multiple equal buttons competing for attention
- heavy boxed search bar treatment if it dominates strip height
- any low-priority filters that belong in contextual UI

### Layout guidance
- left cluster: identity
- center/subtle inline cluster: status / environment summary
- right cluster: actions
- more spacing, fewer visible separators

---

## C. Left rail
**Owner:** `NavRail`

### Responsibilities
- become product signature / slim spine
- drive selection and quick context switching
- avoid feeling like a list panel

### Content model
Top anchor:
- mission mark / workspace emblem

Primary cluster:
- agent nav items
- icon-first by default
- label visible on active, tooltip, or expanded state only

Bottom utility cluster:
- search trigger if not in top strip
- settings
- collapse/expand control

### Interaction states
- collapsed default on desktop is acceptable if active item still communicates enough context
- expanded mode should be a deliberate user action, not permanently open by default
- active item uses illuminated pill/inset style rather than outline-only treatment

### Ownership boundary
The rail should not also become a data-heavy list of agent metadata.
That is exactly how the UI drifts back into sidebar clutter.

---

## D. Center stage
**Owner:** `MissionStage`

### Responsibilities
- establish the immersive mission theatre
- own background atmosphere, focal composition, and stage-level controls
- hold graph / workflow mode without making either mode feel like a separate app

### Subregions
1. **Stage backdrop**
   - tonal gradient
   - subtle falloff / focus weighting
   - minimal noise

2. **Stage toolbar**
   - quiet controls integrated into stage edge
   - not a second topbar

3. **Graph stage body**
   - hero composition
   - empty space protected
   - overlays minimized

### Rules
- stage body must not be wrapped in a generic bordered card
- helpers (drag hint, minimap, view toggle) must feel embedded and quiet
- graph default framing must look intentional for screenshots

---

## E. Right inspector
**Owner:** `InspectorPanel`

### Responsibilities
- contextual side intelligence
- overview when idle, focused detail when selected
- progressive disclosure for deep content

### Modes
1. **No selection / overview mode**
   - brief intro / system overview
   - recent activity or guidance
   - maybe featured/active agent summary

2. **Agent selected / focused mode**
   - summary header
   - skill cluster
   - markdown files
   - future execution/log module if relevant

3. **Deep file preview mode**
   - file opened within inspector section or nested preview module
   - do not turn whole inspector into a stack of full-size cards

### Hierarchy rule
Summary first, details second, raw file content last.

### Ownership boundary
The inspector should not compete with the canvas as a second hero region.
If the inspector becomes visually loud, the redesign misses the brief.

---

## 5. State model changes needed

## Current state in `page.tsx`
- `selectedAgent`
- `searchQuery`
- `openFiles`
- `viewMode`
- `sidebarOpen`
- `darkMode`

This is acceptable for prototype scale, but the redesign needs clearer domain grouping.

## Proposed state model
Create a top-level screen state grouped by concern.

```ts
interface MissionControlUIState {
  theme: "dark" | "light";
  navigation: {
    railExpanded: boolean;
    searchQuery: string;
  };
  stage: {
    mode: "graph" | "workflow";
    pan: { x: number; y: number };
    focusedSkill: string | null;
    selectedPath: string[] | null;
  };
  selection: {
    agentId: string;
    fileId: string | null;
  };
  inspector: {
    mode: "overview" | "agent" | "file";
    expanded: boolean;
  };
}
```

## Why this matters
The redesign adds contextual behaviors:
- inspector changes mode based on selection depth
- rail expansion becomes independent from content selection
- stage focus state should be able to dim unrelated nodes and links
- file preview should be modeled as selection depth, not just a set of toggled accordions

## Concrete changes Gorilla should make

### Replace `openFiles: Set<string>`
With:
- `activeFile: string | null`
- optionally `expandedSections` for lightweight disclosure

Reason:
- multiple files open at once increases visual noise
- redesigned inspector should favor focus over accordion soup

### Replace `sidebarOpen`
With:
- `railExpanded`

Reason:
- this is no longer a full sidebar; it is a rail with compact/expanded states

### Move graph pan/hover state out of rendering clutter
Inside graph hooks:
- `useGraphLayout(agent, viewport)`
- `useGraphInteraction()`

### Add derived UI selectors
Examples:
- `filteredAgents`
- `selectedAgent`
- `inspectorMode`
- `systemStatusSummary`
- `stageTitle`

These should live outside raw JSX where possible.

---

## 6. Styling system changes

## Primary architecture decision
The redesign will fail if styling remains mostly inline JSX objects.

Gorilla should migrate major visual layers to a tokenized styling approach.

## Minimum required styling shift

### A. Introduce semantic design tokens
In `app/globals.css`, define semantic tokens by role, not by old orange-heavy implementation.

Suggested categories:
- background tokens
- surface tokens
- text tokens
- stroke tokens
- accent tokens
- status tokens
- shadow tokens
- blur/radius/spacing tokens

Example shape:
```css
:root {
  --mc-bg-base: ...;
  --mc-bg-stage: ...;
  --mc-surface-rail: ...;
  --mc-surface-inspector: ...;
  --mc-surface-elevated: ...;
  --mc-stroke-soft: ...;
  --mc-text-strong: ...;
  --mc-text-muted: ...;
  --mc-accent: ...;
  --mc-status-live: ...;
  --mc-radius-sm: ...;
  --mc-radius-md: ...;
  --mc-radius-lg: ...;
  --mc-shadow-float: ...;
}
```

### B. Build a surface hierarchy
Required layers:
1. **shell/base**
2. **rail surface**
3. **stage surface**
4. **floating inspector surface**
5. **micro elevated modules**

These must differ by tone, transparency, and elevation—not just border thickness.

### C. Reduce border-first styling
Current pattern relies on:
- thin borders everywhere
- glow + stroke as primary separation

New pattern should rely more on:
- tonal separation
- subtle shadow / blur / material difference
- fewer but more intentional strokes

### D. Typography system
Create reusable text roles:
- display title
- panel title
- section label
- data label
- body secondary
- caption / overline

Rules:
- fewer tiny labels
- more hierarchy via scale and weight
- less dependence on bright orange to communicate importance

### E. Spacing scale
Adopt a deliberate spacing scale and apply it consistently.
Suggested rhythm:
- 4 / 8 / 12 / 16 / 20 / 24 / 32

Critical requirement:
- increase outer margins and internal breathing room by roughly 15–25%
- do not backslide into dense metadata stacking

### F. Dark / light mode architecture
Dark mode and light mode should share identical semantic roles.
Only token values change.

Do not hardcode per-component ad hoc inversions.

### G. Tailwind usage guidance
If Gorilla keeps Tailwind v4 utilities, use them for layout and spacing, but put the premium surface logic behind:
- CSS variables
- component-level utility classes
- reusable semantic classes

Do not rebuild the redesign as another wave of giant inline `style={{ ... }}` objects.

---

## 7. Motion system changes

## Current issues
- graph has visible perpetual particle traffic and pulse effects
- animation is attention-seeking rather than state-communicating
- multiple loops compete with content

## Motion direction
Motion should become **state-led**, not decoration-led.

## Motion architecture by layer

### A. Structural motion
For:
- rail expand/collapse
- inspector width/visibility changes
- mode transitions
- layout rebalancing

Guidance:
- medium duration
- smooth ease
- low bounce / minimal spring theatrics

### B. Focus motion
For:
- node selection
- path reveal
- inspector content swap
- workflow/graph transitions

Guidance:
- selection should feel magnetic and deliberate
- dim unrelated content rather than amplifying everything
- use opacity, blur, scale, and shadow carefully

### C. Ambient motion
For:
- running node pulse
- subtle system-live state
- very quiet stage atmosphere

Guidance:
- low-frequency only
- one ambient system at a time in any given area
- if visible from across the room, it is too much

## Specific implementation changes Gorilla should make

### Remove or heavily reduce
- constant animated particles across every connection
- multiple simultaneous pulse rings around the center node
- loud glowing CTA buttons in stage corner
- obvious “sci-fi dashboard” loops

### Replace with
- hover/selection path emphasis only when relevant
- restrained running-state pulse/orbit for active nodes only
- soft fade/blur of non-selected graph elements
- panel/rail transitions driven by opacity + transform + width interpolation

## Framer Motion guidance
Use Framer Motion selectively for:
- layout transitions
- presence transitions
- selected/focused states

Avoid over-springing all children.
Prefer shared motion presets by intent:
- `micro`
- `panel`
- `focus`
- `ambient`

---

## 8. Graph / canvas implementation architecture

## Objective
Turn `AgentGraph` from “network graph widget” into a mission canvas system.

## Recommended decomposition

### `GraphStage`
Owns:
- stage framing
- atmospheric background
- stage action placement
- initial camera framing

### `GraphCanvas`
Owns:
- SVG or canvas rendering layer
- pan / viewport logic
- main node/link render tree

### `useGraphLayout`
Owns:
- default curated node placement
- graph geometry by agent skill count
- screenshot-friendly composition

Important:
Do not rely only on a naive equal radial layout if the brief wants editorial composition.
A radial system can still be used as a base, but should support:
- asymmetric weighting
- clustered spacing
- controlled emptiness
- stronger focal center

### `useGraphInteraction`
Owns:
- drag/pan state
- hovered skill
- selected skill/path
- focus/dimming behavior

### `GraphNode`
Owns:
- node material look
- semantic statuses: idle / selected / running / blocked
- icon + label hierarchy

### `GraphConnection`
Owns:
- low-contrast default links
- highlighted path state
- directional emphasis only when needed

### `GraphTooltip`
Owns:
- quiet hover details
- should feel premium and integrated, not debug overlay

## Node system requirements
- fewer visual variants overall
- stronger material quality
- clear semantic states
- labels should not create clutter fields around all nodes at once

Suggested behavior:
- primary label visible for selected/hovered nodes or intelligently faded for all
- status color only where meaningful
- selected node gets strongest material separation

## Connection system requirements
Default:
- thin
- quiet
- low contrast

On focus:
- raise contrast
- optionally animate reveal once
- never make the whole graph look electrically busy

## Canvas overlays
Allow only quiet overlays such as:
- mode switch
- fit/reset action
- maybe minimal legend

Do not add noisy HUD chrome unless explicitly justified.

---

## 9. Inspector architecture

## Target behavior
The inspector should feel like a contextual intelligence drawer, not a third dashboard column.

## Proposed hierarchy

### Inspector header
- selected agent identity
- role / status
- one concise summary sentence

### Section 1: summary
- soul / mission summary
- key metadata or current status

### Section 2: capabilities
- skills cluster
- cleaner grouping, not dense badge spam

### Section 3: content access
- markdown files list
- single active preview
- progressive disclosure

### Optional Section 4: activity
- reserved for future execution/log info
- only show when signal exists

## File preview behavior recommendation
Current design allows many files expanded as accordions.
New design should prefer:
- click file → focused preview opens
- only one preview active at a time
- file list remains legible

This is calmer, more premium, and aligns with inspector focus.

## Visual rules
- fewer internal bordered cards
- grouped sections with variable spacing
- one or two elevated modules max
- floating material feel relative to stage background

---

## 10. Top strip architecture

## Objective
Reframe the current topbar into a thin executive status strip.

## Suggested structure

### Left
- `MISSION CONTROL`
- workspace/environment subtitle

### Middle
- compact live summary
  - total agents
  - current mode
  - maybe selected agent count/context

### Right
- command/search trigger
- theme toggle
- settings/profile

## Implementation note
If search remains important, prefer:
- command palette trigger in top strip
- full search field only when active or expanded

This prevents the strip from becoming visually bulky again.

---

## 11. Responsive behavior expectations

## Desktop
- full framed stage layout
- rail + stage + inspector all visible
- inspector narrower by default

## Laptop / tighter desktop
- rail remains collapsed by default
- inspector may collapse to icon/peek state or narrower width
- stage must remain dominant

## Tablet-ish widths
- inspector becomes overlay/drawer
- rail stays icon-only or overlay
- top strip remains thin

## Non-goal for this phase
Do not overinvest in mobile-first redesign unless Mother explicitly requests it.
This phase is about fixing premium desktop silhouette and screenshot quality.

---

## 12. Implementation order for Gorilla

## Phase 1 — silhouette reset
**Must happen first.**

Tasks:
- extract `MissionControlScreen`
- create `MissionControlShell`, `TopStatusStrip`, `NavRail`, `MissionStage`, `InspectorPanel`
- replace current `content-grid` with framed stage layout
- increase page margins and rebalance region widths
- make left rail narrow and right panel quieter

**Gate:** app already reads as a new product shape before detailed graph restyling

---

## Phase 2 — left rail + top strip
Tasks:
- rebuild nav into icon-first sculpted rail
- move low-priority controls into bottom utilities / overflow
- convert bulky topbar into thin status strip
- implement active item treatment and refined hover states

**Gate:** screenshot of left rail + top strip alone already feels premium and materially different

---

## Phase 3 — stage / canvas redesign
Tasks:
- decompose `AgentGraph`
- remove noisy perpetual visual effects
- establish stage background / atmospheric composition
- improve node materials, typography, and focus logic
- refine link visibility and path highlighting
- make default graph framing screenshot-friendly

**Gate:** center canvas is clearly the hero and no longer reads as a generic network graph widget

---

## Phase 4 — inspector refactor
Tasks:
- replace `AgentPanel` with contextual inspector modes
- reduce box soup
- move to single active file preview model
- improve summary/content hierarchy

**Gate:** inspector supports selection without shouting over the stage

---

## Phase 5 — theme + motion tuning
Tasks:
- finalize dark/light token parity
- tune ambient/focus/layout motion
- reduce animation noise
- polish subtle material separation and transitions

**Gate:** both dark and light modes feel intentionally designed, not inverted clones

---

## 13. Explicit non-goals

Gorilla should **not** spend time on the following in this architecture phase unless needed for the redesign to function:

1. **Do not rebuild backend/data APIs**
   - no need to redesign `app/api/agent-file/route.ts` unless inspector preview behavior requires tiny response adjustments

2. **Do not add new product features just because space exists**
   - no chat console
   - no fake telemetry dashboards
   - no execution simulator
   - no unnecessary minimap/HUD complexity

3. **Do not optimize for arbitrary mobile completeness**
   - desktop premium silhouette is the priority

4. **Do not keep old graph visual language and merely recolor it**
   - this is the exact failure mode the brief is rejecting

5. **Do not leave major components as inline-style monoliths**
   - some localized inline values may remain temporarily, but the new system should not depend on them

6. **Do not increase accent saturation or motion intensity to fake “newness”**
   - calmer and more expensive is the brief, not louder and more animated

7. **Do not turn the inspector into another stack of cards**
   - grouped sections and hierarchy, not card soup

8. **Do not preserve the current equal-weight three-region composition**
   - if all regions still shout equally, the rebuild failed

---

## 14. Technical acceptance checklist before Mother UAT

Mother should be able to review the build against this checklist before visual approval.

## Layout / silhouette
- [ ] The app no longer reads as a standard three-column dashboard with equal panel weight
- [ ] Left region is a slim branded rail, not a traditional sidebar list
- [ ] Center stage visually owns the screen
- [ ] Right inspector is narrower/quieter by default and reads as contextual
- [ ] Top area is a thin status strip, not bulky app chrome
- [ ] Outer page padding is materially larger than the previous version

## Component architecture
- [ ] `app/page.tsx` is no longer carrying the full UI directly
- [ ] Layout shell regions are separated into dedicated components
- [ ] Graph system is decomposed enough that layout, rendering, and interaction concerns are not tangled
- [ ] Inspector is split into focused subcomponents rather than one giant panel file
- [ ] Styling is no longer primarily giant inline style objects for all major regions

## Graph / stage quality
- [ ] Center canvas reads as a mission surface, not a generic graph widget
- [ ] Visual clutter in lines/particles/background noise is significantly reduced
- [ ] Node states are clearly distinguishable: idle / selected / running / blocked
- [ ] Links are quiet by default and stronger only on focus/selection
- [ ] Default graph framing looks intentional in screenshots
- [ ] Helpers/controls are integrated quietly into the stage

## Rail / navigation quality
- [ ] Left rail active state feels premium and restrained
- [ ] Hover and expand/collapse interactions feel deliberate
- [ ] Rail does not become a dense metadata stack
- [ ] Top brand anchor is visible and contributes to product signature

## Inspector quality
- [ ] No-selection state shows a meaningful overview instead of dead space or loud placeholders
- [ ] Selection state transforms the inspector into focused context
- [ ] File preview flow is calmer and more deliberate than multi-open accordion soup
- [ ] Internal hierarchy is summary first, details second, raw content last
- [ ] Inspector uses grouped sections instead of many equal-weight cards

## Theme system
- [ ] Dark mode uses graphite/midnight tones rather than pure black + neon
- [ ] Light mode feels intentionally designed and not simply inverted
- [ ] Both themes preserve identical hierarchy and silhouette
- [ ] Surface/material separation works in both themes with minimal border dependency

## Motion system
- [ ] Motion is primarily state-communicating, not decorative
- [ ] Ambient animation is subtle enough to ignore while reading
- [ ] There is no constant high-noise particle/glow competition across the graph
- [ ] Panel transitions, rail behavior, and focus changes feel smooth and premium

## Bryan first-glance test
- [ ] A screenshot crop of the left rail + center stage already feels like a new product
- [ ] Bryan can say “the center canvas is finally the hero” on first glance
- [ ] Bryan can say “this looks materially different” without needing a guided tour

---

## 15. Small architecture notes for Gorilla

### Note 1: Keep data simple, change presentation deeply
The app already has enough data to make the redesign convincing. The win here is composition, hierarchy, and material system—not inventing new data sources.

### Note 2: Preserve future extensibility
The proposed inspector modes and graph decomposition should make it easier later to add:
- execution state
- live telemetry
- multi-agent paths
- richer stage overlays

But those are future layers, not this redesign target.

### Note 3: Screenshot quality is a real requirement
The brief repeatedly implies first-glance judgment. Gorilla should validate the build by taking desktop screenshots at default load state and checking:
- silhouette
- negative space
- stage dominance
- clutter reduction

If the default load state still looks like a dashboard, keep iterating.

---

## 16. Gorilla handoff summary

### What Gorilla should do next
1. Reset the layout silhouette first.
2. Split the shell into rail / top strip / stage / inspector components.
3. Rebuild the graph as a stage-driven mission canvas, not a boxed widget.
4. Refactor inspector into contextual hierarchy with single-focus file preview.
5. Tune theme and motion only after the structure is unquestionably new.

### What Gorilla should avoid
- cosmetic-only reskinning
- preserving equal-weight columns
- excessive border/chrome reuse
- noisy graph animation
- inspector card soup
- light mode as lazy inversion

### Definition of done for the rebuild phase
The app should feel like **executive operations room meets premium product analytics**, with a clearly new silhouette and a center canvas that owns the experience.
