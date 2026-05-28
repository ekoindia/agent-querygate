# Security Policy

## Supported Versions

This project is under active development. Security fixes are applied to the
latest release on the `main` branch. Older tags are not maintained.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please report privately via one of:

- GitHub Security Advisories — use the **"Report a vulnerability"** button under
  the repository's **Security** tab (preferred).
- Email the maintainer with the details and reproduction steps.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a minimal proof-of-concept where possible).
- Affected version / commit.

You can expect an initial acknowledgement within **5 business days** and a
status update within **15 business days**. Coordinated disclosure is preferred:
please give us a reasonable window to release a fix before any public
disclosure.

## Scope & Threat Model

This service is a policy-enforcing broker between AI agents and MySQL. Its
security model and trust boundaries are documented in
[`docs/security.md`](./docs/security.md). Of particular note: the query-safety
guarantees rest on the SQL parser plus the blocked-keyword layer applied to
agent-supplied SQL — review that document before relying on the service in a
hostile setting.
