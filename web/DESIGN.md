# gitstate Design System — "The Ledger"

Dark-first, technical-editorial. Git commit graphs as motif. Hairline borders, grain overlay, teal→indigo gradient mesh.

---

## Fonts

| Role    | Family                        | Variable | Import path |
|---------|-------------------------------|----------|-------------|
| Display | Bricolage Grotesque Variable  | Yes (wght axis) | `@fontsource-variable/bricolage-grotesque` |
| Body    | Hanken Grotesk Variable       | Yes (wght axis) | `@fontsource-variable/hanken-grotesk` |
| Mono    | JetBrains Mono                | No (400/500/700) | `@fontsource/jetbrains-mono` |

### CSS variables
```css
--font-display: 'Bricolage Grotesque Variable', system-ui, sans-serif;
--font-body:    'Hanken Grotesk Variable', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
```

### Tailwind utilities (from index.css `@layer utilities`)
```jsx
<h1 className="font-display text-4xl font-semibold">Heading</h1>
<p className="font-body">Body text</p>
<code className="font-mono">monospace label</code>
```

---

## Color Tokens

All tokens live as CSS custom properties on `:root` (dark) and `.light` (light).

### Semantic (use these in components)

| Token            | Dark value  | Light value | Purpose |
|------------------|-------------|-------------|---------|
| `--bg`           | `#0B1120`   | `#f8fafc`   | Page background |
| `--bg-surface`   | `#111827`   | `#ffffff`   | Card / panel surface |
| `--bg-surface2`  | `#1a2336`   | `#f1f5f9`   | Elevated surface / hover state |
| `--bg-surface3`  | `#1f2d44`   | `#e8edf5`   | Inputs, badges, toggles |
| `--border`       | `#1e2d45`   | `#e2e8f0`   | Default hairline border |
| `--border2`      | `#243352`   | `#cbd5e1`   | Stronger border / hover |
| `--text`         | `#e2e8f0`   | `#0f172a`   | Primary text |
| `--text-dim`     | `#cbd5e1`   | `#1e293b`   | Secondary text |
| `--text-muted`   | `#94a3b8`   | `#475569`   | Muted / metadata |
| `--text-faint`   | `#64748b`   | `#94a3b8`   | Faint / disabled |
| `--brand-teal`   | `#2DD4BF`   | `#2DD4BF`   | Primary accent |
| `--brand-indigo` | `#6366F1`   | `#6366F1`   | Secondary accent |

### Tailwind @theme tokens (use in Tailwind classes)

```
bg-gs-teal      #2DD4BF
bg-gs-indigo    #6366F1
bg-gs-base      #0B1120
bg-gs-surface   #111827
bg-gs-surface-2 #1a2336
bg-gs-border    #1e2d45
bg-gs-muted     #64748b
bg-gs-text      #e2e8f0
```

### Gradient text (brand teal → slate → indigo)
```jsx
import { GradientText } from './components/ui'
<GradientText as="h1" className="text-5xl font-display">git is truth</GradientText>

// Or plain CSS utility:
<span className="gradient-text">text</span>
```

---

## Radii

| Token             | Value  |
|-------------------|--------|
| `--radius-card`   | 12px   |
| `--radius-badge`  | 6px    |
| `--radius-btn`    | 8px    |

---

## Theme System

### Provider

Wrap the app root in `ThemeProvider` (already done in `main.jsx`):

```jsx
import { ThemeProvider } from './lib/theme.jsx'
<ThemeProvider><App /></ThemeProvider>
```

### Hook

```jsx
import { useTheme } from './lib/theme.jsx'

function MyComponent() {
  const { theme, setTheme, resolved } = useTheme()
  // theme:    'dark' | 'light' | 'system'  — persisted choice
  // resolved: 'dark' | 'light'             — what's currently rendered
  // setTheme('light')  — persists to localStorage
}
```

### ThemeToggle component

A compact dark/light/system selector:

```jsx
import { ThemeToggle } from './components/ThemeToggle.jsx'
<ThemeToggle />            // renders in TopBar
<ThemeToggle className="ml-4" />
```

---

## Currency System

### Provider

Already wired in `main.jsx`:

```jsx
import { CurrencyProvider } from './lib/currency.jsx'
<CurrencyProvider><App /></CurrencyProvider>
```

### Hook

```jsx
import { useCurrency } from './lib/currency.jsx'

function PriceTag({ usdAmount }) {
  const { format, currency } = useCurrency()
  return <span>{format(usdAmount)}</span>  // "$9.99" | "R186.93" | "£7.86" | "€9.17"
}
```

Supported currencies (static display rates, real charge rate from backend):

| Code | Flag | Rate (from USD) |
|------|------|-----------------|
| USD  | 🇺🇸  | 1.0             |
| ZAR  | 🇿🇦  | 18.70           |
| GBP  | 🇬🇧  | 0.786           |
| EUR  | 🇪🇺  | 0.917           |

### CurrencySelector component

Flag + code dropdown:

```jsx
import { CurrencySelector } from './components/CurrencySelector.jsx'
<CurrencySelector />
<CurrencySelector className="ml-auto" />
```

---

## UI Primitives

All importable from `./components/ui/index.js`:

```js
import { Button, Card, Badge, Pill, GradientText, Section, Container, Glow, GitGraph, Stat, Kbd, CodeBlock, DiffBlock } from './components/ui'
```

### Button

```jsx
<Button variant="primary" size="md">Deploy</Button>
<Button variant="outline">Cancel</Button>
<Button variant="ghost" size="sm">Edit</Button>
<Button variant="danger">Delete</Button>

// Sizes: xs | sm | md | lg | xl
// Variants: primary (teal→indigo gradient) | outline | ghost | danger
// Props: leftIcon, rightIcon, disabled, onClick, ...button
```

### Card

```jsx
<Card>Default surface card</Card>
<Card padding="lg" glow>With glow + larger padding</Card>
<Card hoverable>Lifts on hover</Card>
<Card padding="none">Custom inner layout</Card>
// padding: none | sm | md | lg | xl
```

### Badge / Pill

```jsx
<Badge>Default</Badge>
<Badge color="teal">Synced</Badge>
<Badge color="indigo">Beta</Badge>
<Badge color="add">+42 lines</Badge>
<Badge color="del">−3 files</Badge>
<Pill color="green">Active</Pill>
// colors: default | teal | indigo | green | red | yellow | blue | add | del
```

### GradientText

```jsx
<GradientText as="h1" className="text-5xl font-display font-semibold">
  The git ledger
</GradientText>
```

### Section + Container

```jsx
<Section py="xl">
  <Container size="lg">
    <h2>Content</h2>
  </Container>
</Section>
// Section py: sm | md | lg | xl | 2xl
// Container size: sm | md | lg | xl | full
```

### Glow

Decorative mesh-gradient radial blob — position absolutely:

```jsx
<div className="relative overflow-hidden">
  <Glow variant="teal" className="top-0 left-1/4" />
  <Glow variant="indigo" size={400} className="bottom-0 right-0" />
  <Content />
</div>
// variant: teal | indigo | brand
// size: number (px, default 600)
```

### GitGraph

Decorative SVG commit graph:

```jsx
<GitGraph className="absolute right-0 top-0 opacity-20" />
<GitGraph variant="compact" width={180} opacity={0.3} />
```

### Stat

```jsx
<Stat label="Cycle time" value="4.2d" delta="+0.3d" deltaDir="up" />
<Stat label="Open PRs" value={42} sublabel="across 3 repos" />
// deltaDir: 'up' (green) | 'down' (red) | 'neutral' (muted)
```

### Kbd

```jsx
<Kbd>⌘</Kbd><Kbd>K</Kbd>
```

### CodeBlock / DiffBlock

```jsx
<CodeBlock lang="go" filename="internal/sync/worker.go">
  {codeString}
</CodeBlock>

<DiffBlock filename="web/src/App.jsx">
{`-import { OldComponent } from './old'
+import { NewComponent } from './new'
 export default function App() {`}
</DiffBlock>
```

---

## Markdown Renderer

```jsx
import { Markdown } from './components/Markdown.jsx'

<Markdown>{markdownContent}</Markdown>
<Markdown className="prose-sm">{shortContent}</Markdown>
```

Styles: headings (Bricolage Grotesque), body (Hanken Grotesk), code blocks (JetBrains Mono), links (teal underline), blockquotes (teal left border), tables (monospace headers), lists (teal bullet dots). All theme-aware.

---

## Motion / Reveal

```jsx
import { Reveal, RevealList } from './components/Reveal.jsx'

// Single element fade-up on mount:
<Reveal delay={0.1}>
  <HeroSection />
</Reveal>

// In-view trigger (fires once when scrolled into view):
<Reveal inView delay={0}>
  <FeatureCard />
</Reveal>

// Staggered list — each child gets a sequential delay:
<RevealList className="grid grid-cols-3 gap-4" staggerDelay={0.07} inView>
  <Card>Feature 1</Card>
  <Card>Feature 2</Card>
  <Card>Feature 3</Card>
</RevealList>
```

---

## Grain / Noise Overlay

```jsx
// Add grain texture to any element:
<div className="grain relative">
  <Content />
</div>
// The ::after pseudo-element applies a subtle SVG noise filter (opacity ~4%)
// Works best on solid/gradient backgrounds — adds print-like texture
```

---

## Shell Structure

```
AppShell (AppShell.jsx)
├── Sidebar (Sidebar.jsx)       — sticky left nav, 216px, brand-themed
│   ├── LogoMark + wordmark
│   ├── OrgSwitcher
│   ├── NavLinks (active = teal)
│   └── User footer + sign out
└── Main column
    ├── TopBar (TopBar.jsx)     — sticky, h-14, backdrop-blur
    │   ├── Section title (Breadcrumb)
    │   ├── "synced" live pill
    │   └── ThemeToggle
    └── <main> p-8 — routed content via <Outlet />
```

All surfaces use `var(--bg-*)` / `var(--border)` tokens so they are theme-aware automatically.
