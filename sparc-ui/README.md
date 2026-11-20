# sparc-ui — shells, core and component library

The frontend half of SPARC AI (Phase 2). One install, used only to develop and
test; the backend server does not depend on it.

```
contracts/rooms.d.ts   plug shapes (GENERATED from ../sparc — run `npm run sparc:generate` in the backend)
core/                  slot system, theme, config checks, icons, formatting
library/_views/<room>.tsx      the structure of each room, written ONCE
library/_skins/<level>         the look of each style level (classes + effects)
library/<room>/<level>/<id>/   components: generated wrappers (view + skin) or hand-made ones
shells/portal-shell    dhaancha for "admin-portal"  (Supabase or demo mode)
shells/site-shell      dhaancha for "portfolio", "landing", "ecommerce" (StoreApp) and "booking" (BookingApp)
test/                  contract, logic, portal journey and site tests
```

## Run

```bash
npm install
npm run dev:portal        # http://localhost:4310  (demo login is shown on screen)
npm run dev:site          # http://localhost:4320  (portfolio sample)
npm run dev:site:landing  # http://localhost:4321  (clinic landing sample)
npm run dev:site:store    # http://localhost:4322  (tea shop sample, practice-card payment)
npm run dev:site:booking  # http://localhost:4323  (clinic booking sample)
npm run check             # typecheck + tests + build
npm run library:generate  # rewrite level wrappers + registries after editing views/skins
npm run library:measure   # re-measure size + accessibility of every component
```

## Style levels: one view, four skins

Each room's structure is written once in `library/_views`. A skin
(`library/_skins`) supplies the look:

- **Basic**: flat.
- **Good**: shadows, hover, CSS transitions.
- **Amazing**: scroll-in animations, stagger, counting numbers, via `motion`.
- **Astonishing**: aurora backgrounds, spotlight + 3D tilt, marquees. Site pages only.

Animated levels respect "reduce motion". The level components in
`library/<room>/<level>/sparc` are generated (view + skin). So every level keeps
its own label, size budget and package rules, without copying code. Hand-made
alternatives sit next to them with a `meta.json`, for example
`dashboard-stat-card/amazing/gradient-tile`, which was promoted from the prototype.

In development, add `?level=good|amazing|astonishing` to the URL to switch levels.

The portal uses Supabase when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
are set (see `shells/portal-shell/.env.example`); otherwise it runs in demo mode
with data kept in the browser. Site forms POST to `VITE_FORM_ENDPOINT` if set.

## How a page is built

1. The shell reads `src/sparc.config.json` and checks it (`core/config.ts`).
2. Pages and room order come from the blueprint (`../sparc/blueprints`).
3. Each room is drawn with `<Slot room="…" props={…} />`.
4. `src/registries/<level>.ts` says which component fills each room at that style level. TypeScript
   rejects any component that does not match its room's contract.
5. Logic (login, lists, forms, dashboard) lives in the shell's hooks, so a
   different-looking component never changes behaviour.

Known limits (Phase 2): settings are saved per browser; notifications and the
activity log are derived from recent record changes; Supabase file uploads need
a public `uploads` storage bucket.
