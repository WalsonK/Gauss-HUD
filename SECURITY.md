# Security Policy

Gauss HUD can send commands to a real vehicle. We take every report seriously.

## Supported versions

Only the latest commit on `main` receives security fixes until the first tagged release.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a security problem.**

Report it privately through GitHub's private vulnerability reporting:
**Security** tab → **Report a vulnerability** (or `https://github.com/WalsonK/Gauss-HUD/security/advisories/new`).

Please include:

- a description of the issue and its impact;
- steps to reproduce, or a proof of concept;
- the affected commit or version and your deployment setup, if relevant.

**Never include real secrets** in a report: OAuth access or refresh tokens, client secrets, private keys, session cookies, pairing codes, PINs or vehicle identification numbers (VINs). Redact them. If you think a secret has leaked, say so and we will tell you how to share details safely.

## Scope

In scope, for example:

- anything that lets a command reach the vehicle without a valid session, outside the command whitelist, without the required PIN, or while the vehicle is moving;
- session, pairing code or PIN bypasses (brute force, replay, fixation, CSRF);
- leaks of tokens, keys or personal data through logs, URLs, responses or the front end;
- ways to trigger paid vehicle API calls (wake-ups, data reads) that bypass the daily caps or the no-polling rules;
- insecure defaults in the deployment examples.

Out of scope: vulnerabilities in third-party services or dependencies themselves (please report them upstream; tell us if Gauss HUD's use of them makes things worse), and issues that require an already compromised server.

## What to expect

- Acknowledgement within 7 days (best effort: this is a volunteer project).
- We will keep you informed while we investigate and fix the issue, and credit you in the advisory unless you prefer otherwise.
- Please give us reasonable time to release a fix before any public disclosure.
