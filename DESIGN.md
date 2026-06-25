# DESIGN.md - AIOps Platform Design System

## Scene & Context
**Scene:** An AI platform engineer analyzing model execution latency, cost metrics, and error rates at 2:00 AM on a multi-monitor setup in a dark control center.
**Requirement:** Low cognitive load, high density, dark-mode first, with high-contrast color codes for fast issue detection.

---

## OKLCH Color Strategy

We follow a **Restrained Dark** strategy (tinted dark neutrals + high-contrast functional highlights).

### Neutrals (Base Slate Tint)
*   `--bg-base`: `oklch(14% 0.006 240)` - Deep void gray (avoiding pure black #000)
*   `--bg-surface`: `oklch(18% 0.008 240)` - Primary card/panel background
*   `--bg-elevated`: `oklch(22% 0.01 240)` - Hover states, tooltips
*   `--border-muted`: `oklch(26% 0.012 240)` - Thin UI borders

### Text
*   `--text-primary`: `oklch(95% 0.004 240)` - Crisp off-white
*   `--text-muted`: `oklch(70% 0.008 240)` - Gray-blue secondary metadata
*   `--text-dim`: `oklch(50% 0.01 240)` - Low priority labels

### Accents (Functional Indicators Only)
*   `--accent-success`: `oklch(78% 0.16 142)` - Bright emerald (success state)
*   `--accent-warning`: `oklch(80% 0.15 85)` - Warm amber (warning state)
*   `--accent-error`: `oklch(62% 0.22 28)` - Neon red-orange (critical state)
*   `--accent-info`: `oklch(74% 0.13 220)` - Clean cyan (metrics & calls)

---

## Typography

*   **Primary Font:** Inter, Outfit, or standard system sans-serif (sans)
*   **Data & Monospace:** JetBrains Mono or Fira Code (mono)
*   **Contrast Rules:**
    *   Code blocks, trace IDs, token counts, and cost numbers MUST use the monospace font for readability.
    *   Hierarchy is achieved through size and weight shifts (medium/semibold), not styling gradients.

---

## Spacing & Grid

*   We use a strict **8px grid system** (`8px`, `16px`, `24px`, `32px`).
*   **Density:** Interfaces are tightly packed to show trace information, but use rhythm to separate headers, charts, and table rows.

---

## Design System Elements

### Cards
*   Cards use a solid `--bg-surface` background and a 1px `--border-muted` border.
*   **Absolute Ban:** No left-stripe accent borders on alerts or metric cards. Use border tints or icons instead.

### Tracing Graph
*   Interactive node flow or cascade timelines (similar to Chrome DevTools or Jaeger Tracing).
*   Timeline bars use `--accent-info` for execution duration, transitioning to `--accent-error` if a span fails.
