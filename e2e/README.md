# End-to-end tests

These Playwright suites drive the running stack at `http://localhost:3000` and expect the backend to be reachable at `http://localhost:8000` (the compose file makes that happen automatically).

## Setup
1. From the repo root run `docker compose up --build` and keep the services running while you test (Compose runs `backend-migrate` first, then starts `backend`/`frontend`).
2. In a new shell `cd e2e` and install the dependencies: `npm install`.
3. (First time only) run `npm run test:install` to download the Playwright browsers.

## Running the tests
```bash
cd e2e
npm test
```
Use `PLAYWRIGHT_BASE_URL` if your frontend exposes a different host/port and `PLAYWRIGHT_BACKEND_URL` to point the seed helpers at another API endpoint. The suites assume a bootstrap admin (default `test-admin` / `test-password`) unless you override `PLAYWRIGHT_ADMIN_USERNAME` / `PLAYWRIGHT_ADMIN_PASSWORD`.

## Cleanup
Stop the stack when you are done:
```bash
docker compose down
```
