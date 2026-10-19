# Gauss HUD

Self-hosted car dashboard for Meta Ray-Ban Display glasses: battery, charging and climate at a glance, plus a few remote commands. Open source, cost-aware, no polling.

> **Status: early development.** The HUD, the API, the vehicle API adapter and the Docker deployment are written, but the adapter has not yet run against a real vehicle. Without vehicle API credentials, everything runs on a mock vehicle.

Gauss HUD is compatible with Tesla vehicles through the official Fleet API. It is an independent project, not affiliated with or endorsed by Tesla, Inc.

## What it does

One screen, built for a glance:

- **Top:** the vehicle's name.
- **One row per function, state on the left and a long button on the right:** cabin temperature | climate on/off (a long press turns the button into a control: swipe left or right to set the target from 16 to 28 °C in half degrees, sent once the swipes stop); rear trunk (opens or closes); guard mode state | guard mode on/off; battery level (with a fill bar and the session's power and end while charging) | charge. Each button offers what fits the current state (climate on → turn it off); the charge button opens or closes the port when unplugged and starts or stops charging when plugged in.
- **Bottom:** lock state and "updated X min ago" (or the progress of a command being sent, and an _asleep_ / _offline_ badge), then this month's estimated API spend as a bar, the amount inside and the monthly credit at the end, turning orange from 80 %.

**Deliberately out of scope:** unlocking, remote start, driving-related features, location, phone-key behaviour, scheduled or automated commands, and any use while driving.

## How it works

- **Self-hosted.** Each user deploys their own instance, registers their own developer application with the vehicle API, and pays for their own API usage. No credentials are ever shared.
- **One origin.** A Fastify server serves both the API and the compiled web app (Vite + React + the official Meta UI Toolkit), behind your own HTTPS reverse proxy.
- **Signed commands** go through the official vehicle command proxy, which runs on an internal network only and is never exposed.
- **UI in English and French**, built for the 600×600 additive display and directional input (arrows + Enter).

## Cost and safety by design

- **No polling and no background calls.** The vehicle is read once when you open the HUD, only if it is already online and the last read is older than a minimum interval. A sleeping car is never woken just to show its status.
- Wake-ups happen only right before a command you trigger. Daily caps on commands and wake-ups, plus a usage counter with an estimated monthly cost.
- **No token in URLs.** Glasses are paired with a single-use 6-digit code (valid 10 minutes), which gives an `HttpOnly`, `Secure`, `SameSite=Strict` session cookie you can revoke from the server.
- **Strict command whitelist** on the server: anything else (unlocking included) is refused.
- Commands refused while the vehicle is in gear; every command logged and notified.
- **Dry-run mode** to simulate commands without calling the vehicle API.

> **Important: enable "PIN to Drive" on your vehicle.** The OAuth scope needed for commands technically allows unlocking and starting the car, whatever this project's whitelist says. PIN to Drive is your last line of defence if your server or tokens are ever compromised.

## Development

Requires Node.js 26 (see `.nvmrc`).

```bash
npm install
cp .env.example .env   # every value is optional on the mock
npm run dev:api        # API on http://localhost:3000, on the mock vehicle (MOCK_SCENARIO)
npm run dev            # HUD on http://localhost:5173, proxied to the API
npm run pair           # prints a single-use pairing code for the HUD
npm run lint && npm run typecheck && npm test && npm run build
```

`npm run build` then `npm start` serves the compiled HUD from the API on a single origin, as in production. `docker build -t gauss-hud .` builds the production image.

Preview it at 600×600 with the [Meta Ray-Ban Display Simulator](https://chromewebstore.google.com/detail/jpjlmmodokemlepklkdbimceggpbjcll) Chrome extension. Use only the arrow keys and Enter, as on the glasses. Pick the mock's scenario with `MOCK_SCENARIO` (`online`, `asleep`, `offline`, `driving`, `no_key`, `failing`) in `.env`. To run the HUD alone without the API, set `VITE_MOCK_SCENARIO` in `apps/web/.env`; the mock's codes are then printed in the browser console.

Layout:

- `packages/shared`: brand-neutral vehicle domain (status, command whitelist), the `VehicleProvider` port, the safety-critical use cases (`runCommand`, `refreshStatus`), the HUD API contract and a mock vehicle. No framework, no vehicle-API specifics.
- `apps/api`: Fastify server: pairing, journal, daily caps, cost counter, dry-run, the vehicle API adapter (`src/vehicle/tesla`) and the CLI (`src/cli.ts`). SQLite through the built-in `node:sqlite`.
- `apps/web/src/core`: HUD-agnostic state, view models, i18n (EN/FR) and the `HudClient` port (HTTP client, plus an in-browser mock).
- `apps/web/src/hud/mrbd`: the Meta Ray-Ban Display front end, the only code that uses the Meta UI Toolkit. Supporting another display means adding a sibling folder.

## Connect your vehicle

Every instance uses its own developer application and pays for its own usage. Once your application is approved on developer.tesla.com, with the redirect URI `https://<your domain>/api/auth/tesla/callback`, the onboarding commands are the same everywhere. On a server they run as `docker compose run --rm gauss-cli <command>` (see [Deploy](#deploy)); on your machine, as `npm run <command>` with the settings in `.env`.

1. Set `PUBLIC_ORIGIN`, `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET` and `TESLA_REGION`.
2. `tesla:keys` generates the key pair (in `secrets/`, never committed). With the server running, the public key is served at `/.well-known/appspecific/com.tesla.3p.public-key.pem`, which must be reachable over HTTPS on your domain.
3. `tesla:register` registers your domain with the vehicle API in your region.
4. `tesla:login` prints a sign-in link. Open it on your phone or computer (sign-in is blocked on the glasses); the server receives the answer and stores the tokens in its database. They are refreshed every 25 days, the only background call.
5. `tesla:vehicles` lists your vehicles: copy the VIN into `TESLA_VIN` and restart. The HUD now reads the real vehicle.
6. `tesla:pair-link` prints the link that installs this application's key on the vehicle. Open it on the phone that has the vehicle app and approve it.
7. Commands are signed by the official proxy. `tesla:proxy-cert` creates its self-signed TLS pair, valid for the host of `TESLA_COMMAND_PROXY_URL`. On a server, start `gauss-tesla-proxy`. On your machine, set `TESLA_COMMAND_PROXY_URL=https://localhost:4443` and `TESLA_PROXY_CA_PATH=secrets/proxy-tls/tls-cert.pem`, run `docker compose -f deploy/docker-compose.proxy.yml up -d` and restart.
8. `tesla:check` checks the token, the connection state and the key pairing.

Keep `DRY_RUN=true` for the first tries: reads are real, wake-ups and commands are simulated.

## Deploy

The image `ghcr.io/walsonk/gauss-hud` (amd64 and arm64, non-root) holds the API and the compiled HUD. It plugs into a server that already runs a Docker reverse proxy with HTTPS (nginx and certbot here): Gauss HUD adds three services to your existing `docker-compose.yml` and publishes no port.

| Service             | Role                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `gauss-hud`         | The app, on your nginx network. Mounts the database and only the public keys, read-only.               |
| `gauss-tesla-proxy` | The official signing proxy, reachable only from `gauss-hud`. The only container with the private keys. |
| `gauss-cli`         | One-shot commands (`docker compose run --rm gauss-cli …`), never started by `up`.                      |

Everything below is done by hand on the server, in the folder of your `docker-compose.yml`:

1. **DNS.** Point a neutral subdomain (e.g. `car.example.com`, never a brand name) to the server. It becomes your application's identity with the vehicle API: changing it later means registering and pairing again.
2. **Services.** Paste the services of [`deploy/compose.services.yml`](deploy/compose.services.yml) into your `docker-compose.yml`, replace `nginx-net` with your nginx container's network and declare `gauss-internal` in `networks:`. Check with `docker compose config --quiet`.
3. **Folders**, owned by the image's user (uid 1000), before the first start:

   ```bash
   mkdir -p gauss-data gauss-secrets/private gauss-secrets/public
   sudo chown -R 1000:1000 gauss-data gauss-secrets
   ```

4. **Settings.** Copy [`.env.example`](.env.example) to `.gauss-env` and set `PUBLIC_ORIGIN=https://car.example.com`, `APP_TIMEZONE` and `DRY_RUN=true`. Leave the paths empty: the image sets them. `chmod 600 .gauss-env`.
5. **Keys.** Generate the signing key pair and the proxy's TLS pair (no vehicle API account needed yet):

   ```bash
   docker compose run --rm gauss-cli tesla:keys
   docker compose run --rm gauss-cli tesla:proxy-cert
   ```

   The private keys land in `gauss-secrets/private/`, mounted only in `gauss-tesla-proxy`.

6. **HTTPS.** Add the subdomain to the `server_name` of your port 80 block and reload nginx, get the certificate (`certbot certonly --webroot -w /var/www/certbot -d car.example.com`), start the app (`docker compose up -d gauss-hud`), then paste [`deploy/nginx/gauss-hud.conf`](deploy/nginx/gauss-hud.conf) with your subdomain and reload nginx (`nginx -t && nginx -s reload`). `https://car.example.com` now shows the HUD, on the mock vehicle.
7. **Vehicle.** Once your application is approved, add `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET` and `TESLA_REGION` to `.gauss-env`, then `docker compose up -d gauss-hud gauss-tesla-proxy`. Follow [Connect your vehicle](#connect-your-vehicle) from step 3 with `docker compose run --rm gauss-cli <command>` (the keys are done). After a change in `.gauss-env` (the VIN), `docker compose up -d gauss-hud` applies it.
8. **Glasses.** `docker compose run --rm gauss-cli pin:set`, then `docker compose run --rm gauss-cli pair` and enter the code on the glasses.
9. **Privacy policy.** The vehicle API requires one for your application: fill in [PRIVACY.md](PRIVACY.md) and publish it where your application form points to.

**Update:** change the image tag if needed, then `docker compose pull gauss-hud gauss-cli && docker compose up -d gauss-hud`. The database and the keys live in `gauss-data/` and `gauss-secrets/`, outside the image: back up both folders. Releases are published by GitHub Actions on every version tag (`v0.1.0`); the first time, make the package public in its GitHub settings.

On the server, allow only SSH (by key), 80 and 443 in the firewall, and turn on automatic security updates.

## Roadmap

| Phase | Content                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| 1     | Repository skeleton, full UI, API on mock data: pairing, PIN, journal, daily caps, cost counter, dry-run    |
| 2     | Onboarding scripts: key pair, public key hosting, partner registration (EU/NA), OAuth flow, pairing command |
| 3     | Real vehicle data and signed commands, virtual key check, monthly token refresh, phone notifications        |
| 4     | Docker image, compose services, reverse proxy example, deployment guide, privacy policy template            |
| 5     | Optional: real-time telemetry                                                                               |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) (every commit must be signed off under the DCO) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md) and never open a public issue. Running your own instance? [PRIVACY.md](PRIVACY.md) is a privacy policy template for it.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for trademark information. All trademarks belong to their respective owners.
