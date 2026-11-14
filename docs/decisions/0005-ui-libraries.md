# UI libraries: Radix primitives, Lucide icons, bundled Inter

## Status

Accepted

## Context

The renderer used plain HTML controls and one stylesheet, with no icons, no
dialogs and `window.confirm` / `window.alert` for prompts. The look-and-feel
work (design note 13) needs accessible dialogs and menus, an icon set and a
consistent font, in light and dark themes, inside a strict CSP
(`default-src 'self'`).

## Decision

- `@radix-ui/react-dialog`, `react-alert-dialog`, `react-dropdown-menu` and
  `react-tooltip`: unstyled, accessible primitives (focus trap, Escape, ARIA).
  All styling stays in our own CSS tokens.
- `lucide-react` for icons, including the category icons drawn from the
  stored icon keys.
- `@fontsource-variable/inter` so the font ships in the bundle and nothing is
  fetched at runtime.
- No full component kit (MUI, Chakra) and no CSS framework: they would fight
  the existing CSS and add weight for little gain.
- No chart library for now: the two chart forms needed are small React and CSS
  components (`Bars.tsx`).

## Consequences

- All of these are renderer-only; `core/` is unaffected.
- The renderer bundle grows (Lucide is tree-shaken by import; Inter adds about
  220 kB of woff2 across subsets).
- Headless scripts must click in-app confirm dialogs instead of relying on
  Playwright's `dialog` handler where a screen has moved off `window.confirm`.
- Inline `data:` images are blocked by the CSP, so decorative shapes (such as
  the select chevron) are drawn with CSS.
