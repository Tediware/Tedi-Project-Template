# Security

This template verifies webhook signatures and holds Tediware API keys, so
flaws in it can matter to every app built from it.

## Reporting a vulnerability

Email info@tediware.com with "Security" in the subject. Please do not open
a public issue. Include what you found, how to reproduce it, and which
version or commit you looked at. We will acknowledge the report and keep you
told of the fix.

Vulnerabilities in the Tediware platform itself, rather than in this
template, go to the same address.

## Scope

In scope: the code in this repository, particularly `lib/tediware/`
(signature verification, the API client) and the webhook routes.

Out of scope: apps built from the template, after they have changed it. The
template ships without authentication on its pages; that is documented, and
adding auth before deploying anywhere shared is up to you.
