## Fenn Frontend

### Getting started
1. `cd frontend`
2. `npm install`
3. `npm run dev`

The dev server listens on `http://localhost:3000` (host and port are forced in `vite.config.ts`) so the frontend can be mounted alongside the backend via Docker Compose or direct `npm` runs.

### Environment
- `VITE_API_BASE_URL` (defaults to `/api` and relies on the Vite proxy entry)
- `VITE_PROXY_TARGET` (override `http://localhost:8000` when the backend runs elsewhere in your composition)

### Architecture highlights
- `src/api`: `ApiClient` centralizes calls (`/auth/login`, `/auth/refresh`, `/groups`, `/categories`, `/items`, `/venn`) and automatically refreshes JWTs on 401.
- `src/hooks`: `useAuth`, `useApi`, `useIsMobile` keep state (tokens, authenticated routing, mobile fallback) isolated and easy to compose.
- `src/components`: shared layout + route protection keep the app shell consistent, with focused accessibility (focus-visible outlines, expressive brand colors, gradient header).

### Screens
- **Login**: username/password up to the backend `/auth/login`, localStorage stores access/refresh tokens, and every request refreshes tokens automatically.
- **Groups**: list your groups, create new ones, and (for admins) add members and onboard users.
- **Categories**: perform CRUD for the selected group and jump to Items or Venn for each category.
- **Items**: create/update/delete items per category with `member_ids` aligning with the backend normalization; only owners or admins can mutate items.
- **Venn Diagram**: a four-set diagram with 15 clickable sections, a refresh action, and a responsive mobile list view, all wired to `/categories/{id}/venn`.

### UX & accessibility notes
- Tailwind-driven cards, gradients, shadows, and focus styles give each screen a high-contrast, intentional feel while meeting WCAG AA ratios.
- Loading states show contextual status (`Refreshing groups…`, `Loading categories…`, etc.) and keep actions disabled while data arrives.
- The Venn diagram couples radial gradients with masked SVG sections and a keyboard-friendly mobile list fallback so every area remains discoverable.

### Run controls
- `npm run dev` – start the dev server (auto proxies `/api` to the backend, so run the backend on `localhost:8000` or adjust `VITE_PROXY_TARGET`).
- `npm run build` & `npm run preview` – release-ready artifacts for staging/production.

When the backend runs via Docker Compose, the frontend will respond at `http://localhost:3000` with the API proxying `/api` through to the service that exposes the authentication, groups, categories, items, and venn endpoints.
