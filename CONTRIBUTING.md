# Contributing to Gauss HUD

Thanks for your interest! This document explains how to propose changes.

## Developer Certificate of Origin (DCO)

This project uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/) instead of a CLA. By signing off a commit, you certify that you wrote the change, or otherwise have the right to submit it under the project's license (Apache 2.0).

**Every commit must carry a `Signed-off-by` line** that matches the commit author:

```
Signed-off-by: Your Name <your.email@example.com>
```

Git adds it for you with `-s`:

```bash
git commit -s -m "feat: add charge port command"
```

Forgot it? Sign off the last commit with `git commit --amend -s --no-edit`, or a whole branch with `git rebase --signoff main`, then force-push your branch. Pull requests with unsigned commits cannot be merged.

## Workflow

1. For anything bigger than a small fix, open an issue first so we can agree on the approach.
2. Fork the repository and create a branch from `main`.
3. Keep changes focused: one topic per pull request.
4. Before opening the pull request, run:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
5. Open the pull request and fill in the template.

## Conventions

- **Language:** code, comments, documentation, issues and commit messages in English. Every user-facing string must exist in both English and French.
- **TypeScript strict** everywhere.
- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …).
- Add or update tests for any change to security or cost logic: command whitelist, PIN, pairing, daily caps, cost counter, moving-vehicle checks.

## Non-negotiable rules

These come from the vehicle API terms and from the project's safety model. Pull requests that break them will not be merged.

- **Naming and branding:** never use "Tesla" or any Tesla product or model name (Model 3/Y/S/X, Cybertruck, Supercharger, Plaid, …) in the name of a package, app, repository, domain or image. "Tesla" may only appear as a plain compatibility mention in body text. No Tesla logo or imagery anywhere.
- **No copied third-party assets:** Meta UI Toolkit components, icons and fonts are npm dependencies only; never commit them to the repository.
- **No secrets anywhere:** no tokens, keys, codes or VINs in code, tests, logs, URLs or the front end. Never put a credential in a URL.
- **Cost control:** no polling and no background calls to the vehicle API. Never wake the vehicle just to display data.
- **Command whitelist only:** the server refuses every command that is not explicitly allowed. Unlocking, remote start, location and automated or scheduled commands are out of scope.
- **No automatic retry** for commands; toggle commands like the trunk must never be replayed.

## Reporting bugs and security issues

- Bugs and feature requests: use the issue templates.
- Security vulnerabilities: **never in a public issue**. Follow [SECURITY.md](SECURITY.md).

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
