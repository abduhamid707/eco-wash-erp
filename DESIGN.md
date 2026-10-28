---
version: alpha
colors:
  brand-navy: "#0A2937"
  sidebar: "#0B2731"
  sidebar-active: "#174650"
  primary: "#0D8275"
  surface: "#F4F7F8"
  surface-card: "#FFFFFF"
  text: "#15353D"
  text-muted: "#6C858C"
  border: "#E2E9EB"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
  utility:
    fontFamily: "ui-monospace, SFMono-Regular, monospace"
rounded:
  control: "10px"
  card: "16px"
spacing:
  base: "4px"
  sidebar-item: "40px"
components:
  sidebar:
    backgroundColor: "#0B2731"
  button-primary:
    backgroundColor: "#0D8275"
---
# ECO WASH ERP Design

## Overview
An operational cockpit for factory staff, managers and owners, never a marketing landing page. The physical manufacturing world is expressed through disciplined navigation and the ECO WASH industrial color signature. Dense enough to operate daily, never exaggerated labels, emojis or decorative noise.

## Colors
Navy navigation anchors the UI. Teal marks *current selection and committed action*; light neutral surfaces let financial tables be legible. Use one strong accent; warning/error remain semantic.

## Typography
Inter for operational navigation and headings, system Uzbek-safe fallbacks. Sidebar body 13px / 20px, section labels 10px, page heading 26px. Never use bold 18px menu labels.

## Layout
Canonical app shell: fixed desktop 260px sidebar, sticky 64px header, independently scrolling document content. Sidebar has its own overflow and a fixed utility footer. Narrow screens use overlay drawer with backdrop and explicit close, never horizontal scrolling navigation.

## Elevation & Depth
Header uses a subtle bottom border. Panels use one low-elevation shadow, no glass effects in authenticated screens.

## Shapes
Controls 10px, panels 16px, sidebar items 10px.

## Components
Canonical nav is the `eco-sidebar` section in `apps/web/src/main.tsx`, CSS runtime owner `apps/web/src/style.css`; future extracted components should preserve API and behavior. Current icons use lucide-react consistently. Nested navigation is controlled by accessible buttons with aria-expanded. Active links have aria-current.

## Do's and Don'ts
Do preserve role-filtered navigation, desktop collapse, mobile drawer, and visible focus. Don't use fake interactive labels, native emoji icons, unbounded page-height sidebar, or global overflow hidden. Existing CSS custom properties own runtime values and this file mirrors those choices.
