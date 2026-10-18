# Gauss HUD

Self-hosted car dashboard for Meta Ray-Ban Display glasses: battery, charging and climate at a glance, plus a few PIN-protected remote commands. Open source, cost-aware, no polling.

> **Status: early development.** Phase 1 (UI and API on mock data) is in progress. Nothing here talks to a real vehicle yet.

Gauss HUD is compatible with Tesla vehicles through the official Fleet API. It is an independent project, not affiliated with or endorsed by Tesla, Inc.

## What it does

One screen, built for a glance:

- **Top:** this month's estimated API spend as a fill bar against the monthly credit, plus an _asleep_ / _offline_ badge.
- **Middle:** cabin temperature and climate on the left, battery level inside a filling ring in the center, range and charging (power, estimated end) on the right.
- **Manual commands as round buttons:** rear trunk (PIN-protected), guard mode, charge port, climate, charging. Each button offers what fits the current state (climate on → turn it off).
- **Bottom line:** lock state and "updated X min ago" (or the progress of a command being sent).

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
- PIN (hashed, locked for 15 minutes after 3 failures) for the trunk; commands refused while the vehicle is in gear; every command logged and notified.
- **Dry-run mode** to simulate commands without calling the vehicle API.

> **Important: enable "PIN to Drive" on your vehicle.** The OAuth scope needed for commands technically allows unlocking and starting the car, whatever this project's whitelist says. PIN to Drive is your last line of defence if your server or tokens are ever compromised.

## Development

Requires Node.js 26 (see `.nvmrc`).

```bash
npm install
npm run dev        # HUD on http://localhost:5173, running on an in-browser mock vehicle
npm run lint && npm run typecheck && npm test && npm run build
```

Preview it at 600×600 with the [Meta Ray-Ban Display Simulator](https://chromewebstore.google.com/detail/jpjlmmodokemlepklkdbimceggpbjcll) Chrome extension. Use only the arrow keys and Enter, as on the glasses. The mock's development codes are printed in the browser console. Pick a scenario with `VITE_MOCK_SCENARIO` (`online`, `asleep`, `offline`, `driving`, `no_key`, `failing`) in `apps/web/.env`.

Layout:

- `packages/shared`: brand-neutral vehicle domain (status, command whitelist), the `VehicleProvider` port, the safety-critical use cases (`runCommand`, `refreshStatus`) and a mock vehicle. No framework, no vehicle-API specifics.
- `apps/web/src/core`: HUD-agnostic state, view models, i18n (EN/FR) and the `HudClient` port.
- `apps/web/src/hud/mrbd`: the Meta Ray-Ban Display front end, the only code that uses the Meta UI Toolkit. Supporting another display means adding a sibling folder.

## Roadmap

| Phase | Content                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------------------- |
| 1     | Repository skeleton, full UI, API on mock data: pairing, PIN, journal, daily caps, cost counter, dry-run    |
| 2     | Onboarding scripts: key pair, public key hosting, partner registration (EU/NA), OAuth flow, pairing command |
| 3     | Real vehicle data and signed commands, virtual key check, monthly token refresh, phone notifications        |
| 4     | Docker image, compose file, reverse proxy example, deployment guide, privacy policy template                |
| 5     | Optional: real-time telemetry                                                                               |

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) (every commit must be signed off under the DCO) and the [Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, follow [SECURITY.md](SECURITY.md) and never open a public issue.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for trademark information. All trademarks belong to their respective owners.
