# Kat Redesign Brief — Mission Control Visual Reset

## Why this exists
The last pass still read like the same product with cosmetic cleanup. This brief is a clean reset.

Keep the spirit of RUBRIC's confidence, clarity, and cinematic systems feel — but stop referencing it so literally in composition, spacing, and chrome. The new direction should feel more premium, more editorial, and more intentional. Bryan should feel the difference in the first 3 seconds.

## New visual direction
**Design phrase:** _executive operations room meets premium product analytics._

The UI should feel:
- calmer, darker, and more expensive
- less gamer/control-panel clutter
- less boxed-in and less "dev tool"
- more balanced through strong margins, larger panels, and clearer hierarchy
- more branded through a distinct silhouette, not just different colors

### What must change from current
- Fewer hard rectangles and fewer equal-weight panels
- Less reliance on thin borders everywhere
- Less visual noise in the graph area
- Less "sidebar + top bar + right bar" all competing at once
- More negative space, larger type hierarchy, stronger focal point

---

## 1) Layout changes

### Current problem
The dashboard still reads as a standard three-column app shell with a graph dropped in the middle. Everything has similar visual weight, so nothing feels premium.

### New layout
Shift to a **framed stage layout**:

- **Left rail:** slim, iconic, sculpted navigation rail
- **Center stage:** large immersive command canvas as the hero
- **Right inspector:** contextual floating panel, narrower by default, expandable when needed
- **Top strip:** thin executive status bar, not a bulky app header

### Structural guidance
- Increase outer page padding significantly (think 20–32px breathing room)
- Make the center canvas visually dominant: it should own ~60–70% of the screen width
- De-emphasize secondary UI by reducing default contrast and density around the edges
- Stop treating every region as a card with identical border treatment
- Use layered surfaces instead of many boxes: base shell, elevated inspector, immersive central stage

### Visual silhouette Bryan should notice
The app should no longer look like a generic dashboard grid. It should look like:
- a **slim left spine**
- a **large central theatre**
- a **quiet floating inspector**

That silhouette difference matters.

---

## 2) Left sidebar redesign

### Goal
Turn the current sidebar from a utility nav into a premium product signature.

### Direction
Replace the current heavier panel with a **narrow vertical rail** that feels deliberate and elegant.

### Changes
- Reduce width materially; default should feel compact
- Use icon-first navigation with restrained labels or label-on-active / label-on-expand behavior
- Give the rail a distinct surface treatment from the main background: soft translucency or satin solid
- Add one strong branded anchor at the top (mission mark/logo/workspace emblem)
- Group nav items with more spacing and fewer separators
- Move low-priority controls to the bottom utility cluster
- Avoid the current flat list feel; the sidebar should feel curated, not stacked

### Active state
- Use a bold but minimal active treatment: pill glow, inset highlight, or soft illuminated tab
- Avoid loud bright outlines
- Active state should feel luxurious, not dashboard-default

### Microinteraction
- On hover: soft lift / subtle backlight
- On collapse/expand: smooth width interpolation, icons stay anchored, labels fade/slide with restraint

---

## 3) Graph / canvas redesign

### Goal
This is the hero. The current graph is too visibly "network graph widget." It needs to feel like a mission surface.

### Core shift
Move from **diagram on a background** to **orchestrated spatial canvas**.

### Changes
- Reduce visual clutter in lines, particles, and decorative noise
- Increase the sense of depth with layered glows, focus falloff, and atmospheric gradients
- Give the canvas a darker, more cinematic base with subtle tonal variation rather than obvious texture
- Make nodes feel like premium control objects, not just draggable chips
- Rework spacing so the composition can breathe; default layout should feel intentional and staged

### Node styling
- Use fewer node styles, but make them better
- Nodes should feel substantial: glass/ceramic/metal hybrid, not flat badges
- Strong typography hierarchy inside nodes
- Better distinction between:
  - selected
  - idle
  - running
  - blocked/error
- Running state should feel alive via restrained pulse or orbit, not constant busy flicker

### Connection styling
- Thin, elegant, low-contrast links by default
- Stronger only on selection/hover/path tracing
- Consider directional energy only when relevant; avoid making the whole graph constantly animated

### Canvas composition
- Add a focal-center composition so the screen looks good even before interaction
- Default zoom/placement should feel curated for screenshots
- Minimap, controls, and helpers should be quieter and more integrated into the stage
- Empty zones are good; don't fill every inch

### Interaction feedback
- Dragging a node should feel magnetic and precise
- Selection should dim non-relevant elements slightly
- When a path is active, reveal the path elegantly instead of blasting everything equally

---

## 4) Top bar redesign

### Goal
The current top area likely reads as standard app chrome. Reframe it as an executive status strip.

### Direction
Make it thinner, cleaner, and more compositional.

### Changes
- Reduce bar height
- Remove bulky container feel
- Prioritize 3 things only:
  - page/context title
  - system status summary
  - a small set of high-value actions
- Push lower-priority actions into overflow or contextual areas
- Use more spacing between groups; fewer visible dividers
- Let title + subtitle carry more confidence through typography instead of extra boxes

### Recommended content behavior
- Left: concise workspace/page identity
- Center or subtle inline region: live system state / environment summary
- Right: mode toggle, search/command trigger, profile/settings

### Tone
Feels like a premium monitoring product, not an admin panel.

---

## 5) Right panel redesign

### Goal
The right panel should feel like an inspector drawer for focused work, not a permanently shouting third column.

### Direction
Make it **contextual, layered, and quieter by default**.

### Changes
- Narrower default width
- Stronger internal hierarchy: summary first, deep details second
- Replace stacked equal cards with grouped sections and variable spacing
- Use one or two elevated modules max; avoid full-panel box soup
- Consider floating/panel-within-stage behavior rather than fully docked slab energy
- Collapse or reduce low-signal sections unless an item is selected

### Interaction model
- No selection: show elegant overview / recent activity / quick guidance
- On node selection: transform into focused inspector for that node
- On execution: reveal live metrics/logs in a more deliberate way, with progressive disclosure

### Visual treatment
- Slightly brighter/elevated than background, but still restrained
- More blur/tint/layering, fewer harsh borders
- Clear text hierarchy so it reads like a premium tool, not dev diagnostics

---

## 6) Motion / animation guidance

### Principle
Motion should communicate state, confidence, and quality — not show off.

### Desired feel
- smooth
- deliberate
- low-frequency
- physically believable
- premium OS/product motion, not sci-fi overload

### Use motion for
- panel expansion/collapse
- node focus transitions
- path reveal
- sidebar active changes
- theme switching
- subtle status pulses

### Avoid
- constant particle noise
- multiple looping glows competing at once
- abrupt springiness everywhere
- flashy neon flicker
- long exaggerated animation durations

### Timing guidance
- micro interactions: fast, crisp
- panel/layout shifts: medium, smooth, slightly eased
- ambient motion: very subtle, almost ignorable

If Bryan notices the animation before the information, it's too much.

---

## 7) Dark / light mode expectations

### Dark mode
This should be the hero mode.
- Deep graphite / midnight base, not pure black
- Tonal layering must be visible even with low contrast
- Use restrained glow accents for focus and active system state
- Premium feel comes from material separation, not bright outlines

### Light mode
Must not feel like a simple inversion.
- Warm light neutral base, not stark white everywhere
- Maintain depth using soft shadows, tinted surfaces, and subtle layering
- Graph area should remain elegant and calm, not washed out
- Border usage should stay minimal

### Both modes must share
- the same hierarchy
- the same silhouette
- the same premium spacing system
- the same interaction logic

Do not make dark mode exciting and light mode generic.

---

## 8) Style system guardrails

### Typography
- Larger, calmer headings
- Fewer tiny labels
- More contrast through weight/scale, less through bright color
- Tighten the information hierarchy so executives can scan immediately

### Color
- Reduce accent count
- One primary accent family + semantic states
- Let neutrals do more work
- Avoid overly saturated "tech" gradients unless extremely controlled

### Surfaces
- Prefer layered materials over bordered boxes
- Use radius consistently, likely a little more refined and less chunky
- Shadows/glows should separate planes subtly

### Density
- Reduce by ~15–25% from the current feel
- More whitespace = more confidence

---

## 9) Implementation priority order for Gorilla
1. **Change the layout silhouette first**
2. **Redesign the left rail and top strip**
3. **Rebuild the canvas visual language**
4. **Refactor the inspector panel hierarchy**
5. **Tune motion and theming last**

If the silhouette does not change, this redesign will still feel like the failed version.

---

## 10) Acceptance checklist Bryan would notice immediately

Bryan should be able to glance at the new version and immediately say:
- "Okay, this looks materially different."
- "The center canvas is finally the hero."
- "The sidebar feels premium, not generic."
- "The whole thing feels calmer and more expensive."
- "There are fewer boxes and less visual clutter."
- "This is still in the same product category, but clearly not the same UI."
- "Dark and light mode both feel intentionally designed."

## One-line test
If someone screenshot-crops the center + left rail, it should already feel like a new product.
