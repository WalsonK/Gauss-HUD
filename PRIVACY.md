# Privacy policy template

The vehicle API requires a privacy policy for every application. Each Gauss HUD instance is run by its own operator, so this is a **template**: replace every `[…]`, check that it matches your setup, and publish it at a public URL (for example on your instance's domain or your website). It is not legal advice.

---

# Privacy policy of [instance name]

_Last updated: [date]_

[Instance name] (the "application") is a personal, self-hosted instance of the open-source software Gauss HUD, run by [your name], [contact email] (the "operator"). It shows the state of the operator's own vehicle on the operator's smart glasses and sends a few remote commands triggered by hand. It is not a public service: the only user is the operator [and the people they allow: …].

## Data the application processes

- **Vehicle data**, read from the vehicle manufacturer's API when the application is opened and the vehicle is already online: battery level and range, charging state, cabin temperature and climate settings, lock, trunk and guard mode state, the gear state (to refuse commands while driving), the vehicle's name and VIN. **The location of the vehicle is never requested.**
- **Account tokens** for the vehicle manufacturer's API, obtained when the operator signs in, to read the vehicle and send commands.
- **Command journal:** for each command, its time, its type and value, its result, whether it was simulated, and the IP address it came from.
- **Usage counters:** the number of API calls per day and per type, to cap and estimate the cost.
- **Pairing and access:** hashes of pairing codes and of session cookies, and a hash of the PIN. The codes, cookies and PIN themselves are never stored.
- **Technical logs** of the server (requests and errors), without tokens, codes or keys.

## Purpose and legal basis

The data is used only to show the vehicle's state, run the commands the operator triggers, protect the account (journal, caps, PIN) and control the cost of the API. [Legal basis, e.g. under the GDPR: the operator's legitimate interest in using their own vehicle.]

## Storage and security

All data is stored on the operator's server, [hosting provider, country], in a local database. Access to the application requires pairing the glasses with a single-use code, then an `HttpOnly` session cookie; commands are signed by the official signing proxy, whose private key never leaves the server. Traffic is encrypted with HTTPS.

## Sharing

The data is **not sold, shared or transferred** to any third party. The only external party is the vehicle manufacturer's API, which receives the requests needed to read the vehicle and run commands, under its own privacy policy. [If you turn on phone notifications: the text of each notification goes through [ntfy server].]

## Retention

- Vehicle data: only the last read is kept, replaced at the next one.
- Account tokens: until the operator signs out or revokes the access.
- Command journal and usage counters: [retention period, e.g. 12 months], then deleted by the operator.
- Sessions: until revoked; pairing codes expire after 10 minutes.

## Revoking access and your rights

The operator can revoke every session of the glasses on the server at any time, and revoke the application's access to the vehicle account from the manufacturer's account settings and the vehicle's key list. Deleting the instance's data folder removes all stored data.

[Rights of the people concerned, e.g. under the GDPR: access, rectification, erasure, objection, and the right to complain to the data protection authority.] For any question: [contact email].
