# SoilSense Design System

> **Current theme (Oct 2026): dark brutalism × agriculture.** A bold, blocky visual language — square slabs, 2 px formwork seams, hard offset shadows, monumental condensed type, numbered sections and mono "plate" labels — applied to a farming product: **emerald** for crop, **harvest wheat** for highlights. Source of truth: `frontend/src/styles/tokens.css` + `brutal.css` (+ `landing.css`).

| Role | Token | Value | Contrast |
|---|---|---|---|
| Page (soot) | `--bg` | `#0D0F0D` | — |
| Cast-concrete slab | `--surface-1` | `#161916` | — |
| Inputs / tiles / table heads | `--surface-2` | `#1F231F` | — |
| Formwork seam (decorative) | `--border` | `#2F352F` | — |
| Form-control border | `--border-strong` | `#747D74` | 3.7 : 1 on surface-2 |
| Text (bone) / secondary / muted | | `#ECE7DA` / `#B9B4A6` / `#8F8B80` | 15.6 / 9.3 / 5.7 : 1 |
| Primary fill (crop emerald) | `--emerald-700` | `#047857` | white text 5.5 : 1 |
| Accent text | `--emerald-400` | `#34D399` | 10.0 : 1 |
| Harvest wheat | `--wheat` | `#E0B341` | 9.8 : 1 on bg; soot text on wheat 9.8 : 1 |
| Status (dark-stepped) | | success `#4ADE80` · warning `#FB923C` · danger `#F87171` · info `#60A5FA` | all ≥ 5.7 : 1 |
| Chart series | | moisture `#3987E5` · temp `#D95926` · humidity `#199E70` | validated dark, all-pairs |

**Type.** Display **Big Shoulders Display** 800/900, uppercase (monumental, condensed — poster lettering). Body **IBM Plex Sans** 400–600 (industrial grotesk). Labels, buttons and data **IBM Plex Mono**, uppercase with tracking. All self-hosted via `@fontsource` (no Google Fonts request).

**Geometry.** `--radius-*: 0` everywhere; borders 2 px; primary buttons and KPI slabs carry a hard `6px 6px 0 #000` shadow and "press" (translate 4 px, shadow off) when clicked; focus ring is a 3 px wheat outline.

**Composition.** Sidebar is black concrete with a solid emerald active slab and wheat edge; KPI/stat tiles are deep emerald slabs; the dashboard welcome is a wheat poster block with a diagonal emerald band (constructivist); section numbers are outlined wheat numerals (01, 02…). Landing photography (Unsplash) is duotoned — grayscale + emerald or wheat multiply — so mixed sources read as one series; colour returns on hover.

---

# (Reference) previous palettes
# (Reference) Dark Emerald Design System

Phase 1 deliverable. Every value here is implemented in `frontend/src/styles/tokens.css`; components reference **roles** (`--surface-1`, `--text-muted`) rather than raw hex, so a palette change happens in one file.

**Design intent.** Professional, trustworthy, calm. Farmers use this outdoors on mid-range Android phones, often in bright sun and on 3G/4G. That drives four rules:

1. **High contrast first.** Body text is ≥ 10:1, the smallest muted text is ≥ 4.5:1 (WCAG AA), and form-control borders are ≥ 3:1.
2. **Big targets.** Every button and input is at least 44 × 44 px. Inputs use 16 px text so iOS doesn't zoom in.
3. **Colour never works alone.** Every status (Dry, Online, Critical…) also carries an icon and a word.
4. **Plain language.** "Irrigate today: about 650 kL (13 h of pumping)" rather than "VWC deficit 12 %".

---

## 1A. Colour palette

All contrast ratios below were computed with the WCAG 2.x formula; they aren't estimates.

### Primary — Emerald

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `--emerald-700` **Main Emerald** | `#047857` | 4, 120, 87 | Primary buttons, active segmented control, brand mark. White text on it = **5.48 : 1** ✅ |
| `--emerald-400` **Emerald Light** | `#34D399` | 52, 211, 153 | Links, focus ring, active-nav text accent, highlights. On `--bg` = **9.83 : 1** |
| `--emerald-800` **Emerald Dark** | `#065F46` | 6, 95, 70 | Primary hover. White on it = **7.68 : 1** |
| `--emerald-900` | `#064E3B` | 6, 78, 59 | Pressed state, deep CTA sections, avatar background |
| `--emerald-950` | `#022C22` | 2, 44, 34 | Gradient ends, auth-page aside |
| `--emerald-300` | `#6EE7B7` | 110, 231, 183 | Active nav label, Farmer ID display (11.3 : 1) |
| `--emerald-600` | `#059669` | 5, 150, 105 | Checkbox accent, hover borders. Not used behind white text, because it only reaches 3.8 : 1 |

> Hover goes **darker** (700 → 800), not lighter. The obvious "lighter on hover" choice (`#059669`) drops white-text contrast below AA.

### Surfaces and neutrals (green-tinted greys)

| Token | Hex | RGB | Usage |
|---|---|---|---|
| `--bg` | `#04140E` | 4, 20, 14 | Page background |
| `--surface-1` | `#0A1F17` | 10, 31, 23 | Cards, sidebar, modals |
| `--surface-2` | `#0F2A20` | 15, 42, 32 | Inputs, metric tiles, table headers, chart plot |
| `--surface-3` | `#163A2C` | 22, 58, 44 | Hover rows, selected row |
| `--border` | `#1E4636` | 30, 70, 54 | Card / table dividers (decorative) |
| `--border-strong` | `#43856A` | 67, 133, 106 | Input and secondary-button outlines. **3.5 : 1** on surface-2 (WCAG 1.4.11) |
| `--text-primary` | `#E8F3EE` | 232, 243, 238 | Headings, values. **16.6 : 1** on bg |
| `--text-secondary` | `#A9C2B7` | 169, 194, 183 | Body copy, labels. **10.0 : 1** |
| `--text-muted` | `#7A968A` | 122, 150, 138 | Captions, timestamps, axis ticks. **5.9 : 1** on bg, 4.8 : 1 on surface-2 |

### Functional colours

Each one has a foreground (text/icon), a 12 % tint background and a ~38 % border, so alerts and badges read clearly without being garish.

| Role | Hex | RGB | On surface-1 | Used for |
|---|---|---|---|---|
| Success / Growth | `#4ADE80` | 74, 222, 128 | 9.9 : 1 | "Good" moisture, sensor Online, applied recommendations |
| Warning / Alert | `#FB923C` | 251, 146, 60 | 7.6 : 1 | Dry soil, heat stress, stale sensor, HIGH priority |
| Danger / Error | `#F87171` | 248, 113, 113 | 6.2 : 1 | Critical moisture, form errors, delete actions |
| Info / Data | `#38BDF8` | 56, 189, 248 | 8.0 : 1 | MEDIUM priority, informational alerts, waterlogging |

Success green (`#4ADE80`) is deliberately **yellower** than the brand emerald, so "good" never reads as "this is a button".

### Data-visualisation series

Validated with the `dataviz` palette checker (dark mode, **all-pairs**, surface `#0F2A20`). All checks pass: lightness band, chroma floor, colour-blind ΔE ≥ 9.4, normal-vision ΔE ≥ 20.9, and ≥ 3 : 1 against the plot.

| Series | Hex | Why |
|---|---|---|
| Soil moisture | `#3987E5` blue | water |
| Temperature | `#D95926` orange | heat |
| Humidity | `#199E70` aqua | air |

Chart rules applied in `components/charts.jsx`:

- **One unit per chart.** Moisture, temperature and humidity are never sharing a dual axis.
- **Missing data shows as a gap** (`connectNulls={false}`), so outages are visible rather than interpolated.
- **Thresholds are dashed reference lines** with direct labels, and the healthy range is a faint green band.
- Lines are 2 px. Bars have 4 px rounded data-ends and a max width of 36 px. The grid is recessive (`#1A3D30`).
- Every chart has a **Table** toggle (accessible data view) and a crosshair tooltip. Text always uses text tokens, never the series colour.
- Two-series charts (your yield vs the district) also differ by **dash pattern**, not only by colour.

### Usage examples

```css
.btn-primary            { background: var(--emerald-700); color: #fff; }
.btn-primary:hover      { background: var(--emerald-800); }
.card                   { background: var(--surface-1); border: 1px solid var(--border); }
.input                  { background: var(--surface-2); border: 1px solid var(--border-strong); }
.input:focus            { border-color: var(--emerald-400); box-shadow: 0 0 0 3px rgba(52,211,153,.45); }
.badge-warning          { color: var(--warning); background: var(--warning-bg); border-color: var(--warning-border); }
```

---

## 1B. Typography

### Recommendation 1 (implemented): Sora + Inter + JetBrains Mono

| Role | Font | Weights | Why |
|---|---|---|---|
| Headings | **Sora** | 600, 700 | Geometric and slightly wide, so it feels modern and "tech" without being cold. Strong at small heading sizes |
| Body | **Inter** | 400, 500, 600 | Designed for screens. Tall x-height keeps it readable on low-DPI phones in sunlight |
| UI / data | **JetBrains Mono** | 500, 600 | Tabular numerals, so sensor values don't jitter when they update live. Used for IDs (FRM-0001) and every number |

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&family=Sora:wght@600;700&display=swap" rel="stylesheet">
```

- https://fonts.google.com/specimen/Sora
- https://fonts.google.com/specimen/Inter
- https://fonts.google.com/specimen/JetBrains+Mono

`display=swap` plus system fallbacks (`system-ui, Segoe UI, Noto Sans`) mean text renders immediately on slow networks.

### Recommendation 2 (bilingual): Poppins + Hind

| Role | Font | Why |
|---|---|---|
| Headings | **Poppins** 600/700 | Indian Type Foundry design. Latin + **Devanagari** in one family |
| Body / UI | **Hind** 400/500/600 | Also by ITF. Made for UI text in Hindi and Marathi, metrically compatible with Poppins |

Use this pairing when you add the Hindi UI (the `preferred_lang` column already exists in `farmers`). Mixed-script screens such as "सिंचाई करें — 650 kL" will then share one visual voice, which Sora/Inter cannot do.
- https://fonts.google.com/specimen/Poppins · https://fonts.google.com/specimen/Hind

### Type scale

| Element | Size | Weight | Line height | Font |
|---|---|---|---|---|
| Hero (landing) | `clamp(36px, 5vw+16px, 60px)` | 700 | 1.05 | Sora, −0.03em |
| Page title (h1) | 24 px | 700 | 1.2 | Sora |
| Card title (h2) | 16–18 px | 600 | 1.2 | Sora |
| Body | 16 px | 400 | 1.6 | Inter |
| Secondary / table | 14 px | 400–500 | 1.5 | Inter |
| Caption / axis / badge | 12 px | 500–600 | 1.4 | Inter |
| Stat value | 32 px (24 px ≤ 425 px) | 600 | 1.1 | JetBrains Mono, tabular |
| Metric tile | 18 px | 600 | 1.2 | JetBrains Mono |
| Stat label | 12 px UPPERCASE, +0.06em | 600 | 1.2 | Inter |

---

## 1C. Components

All of these live in `frontend/src/components/ui.jsx` and `styles/components.css`.

### Buttons — `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`; sizes `sm` 36 px, default 44 px, `lg` 52 px

| State | Primary | Secondary | Ghost | Danger |
|---|---|---|---|---|
| Default | bg emerald-700, white | bg surface-2, border-strong | transparent, text-secondary | transparent, danger text, danger border |
| Hover | bg emerald-800, border emerald-600 | bg surface-3 | bg surface-2, text-primary | danger-bg tint |
| Active | bg emerald-900, translateY(1px) | translateY(1px) | — | — |
| Focus | 3 px emerald-400 ring at 45 % (keyboard only, via `:focus-visible`) | same | same | same |
| Disabled | 50 % opacity, `not-allowed` | same | same | same |
| Loading | `aria-busy`, inline spinner replaces the icon, click blocked | same | same | same |

### Form inputs — text, number, select, date, password

- 44 px minimum height, 16 px text, 10 px radius, surface-2 fill and a 3.5 : 1 border.
- Hover: border emerald-800. Focus: border emerald-400 plus ring. Invalid: `aria-invalid` gives a danger border and an inline error with an icon, linked by `aria-describedby`.
- Number inputs use the mono font. Date inputs get an inverted picker icon. Selects use a custom chevron.
- Password inputs have a show/hide toggle; signup adds a strength meter.
- Labels always sit above the field (never placeholder-only). Required fields show a red `*`.

### Cards and containers

- `.card`: surface-1, 1 px border, 14 px radius, 20 px padding (16 px on phones).
- `.card-interactive`: lifts 1 px and brightens the border on hover; keyboard-reachable (`tabIndex`, Enter).
- `.stat`: uppercase label with an emerald icon, a mono value plus unit, and a muted foot line.
- `.metric`: compact surface-2 tile used inside field cards.

### Navigation

- **Desktop ≥ 1025 px:** 248 px sidebar, collapsible to 72 px (remembered per browser). The active item gets an emerald tint, light text and a 3 px left indicator. The urgent-count badge sits on Recommendations.
- **Tablet 769–1024 px:** icon rail (72 px); tap the menu to expand.
- **Mobile ≤ 768 px:** hamburger opens a slide-in drawer with a scrim, plus a **bottom tab bar** (5 items, 60 px tall, safe-area aware), which is the most thumb-friendly pattern for one-handed field use.
- **Top bar:** page title, live-update dot (pulsing green when the SSE stream is connected), alerts bell, avatar.

### Modal

Centred, 520 px wide, 20 px radius, blurred `--overlay` backdrop. On phones it becomes a **bottom sheet** with full-width buttons. Escape and backdrop-click close it, focus moves into the dialog and returns afterwards, and body scroll is locked.

### Alerts and notifications

- **Inline alert** (`<Alert tone>`): tint background, coloured icon, white title, secondary body. Danger alerts use `role=alert`.
- **Toast:** bottom-right (above the tab bar on mobile), with at most 4 stacked. Success auto-dismisses after 4.5 s and errors after 7 s. They live in an `aria-live` region.
- **Badge:** 24 px pill with icon plus word. Priority mapping: Critical = danger, High = warning, Medium = info, Low = emerald.

### Data visualisation

Recharts, with the rules listed under the data-viz palette above. Empty and error states are built into each chart card. A loading skeleton shimmer matches the chart height to avoid layout shift.

---

## Responsive breakpoints (Phase 7)

| Width | Layout |
|---|---|
| 1920 / 1440 | Content capped at 1440 px. Dashboard is 2 : 1 (fields | alerts + weather). 4-up stat row |
| 1024 | Icon-rail sidebar. Stats 2-up. Dashboard stacks below 1100 px |
| 768 | Drawer + bottom tabs. Grids → 1 column. Modals → bottom sheets |
| 425 / 375 | Stats stay 2-up with 24 px values. Low-priority table columns hidden. Charts 220 px tall. Segmented controls go full width |

Verified with Playwright screenshots at 1440 × 900 and 375 × 812 with **no horizontal page scroll** (wide tables scroll inside their own container).
