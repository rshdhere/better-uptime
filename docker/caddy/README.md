# Caddy Ingress for Custom Status Domains

This setup enables customer-facing status pages on custom hostnames like:

- `status.startup.com`

It uses Caddy on-demand TLS with an allowlist check against the app's verified
domain records.

## Prerequisites

- Frontend app reachable at `127.0.0.1:3000`
- API server reachable at `127.0.0.1:8084`
- DNS for customer hostnames points to this server
- Customer hostnames are verified in-app with both:
  - `CNAME status.customer.com -> status.raashed.xyz`
  - TXT verification record generated in dashboard

## Files

- Caddy config: `docker/caddy/Caddyfile`
- TLS ask endpoint: `apps/client/app/api/tls/ask/route.ts`

## How TLS issuance is restricted

1. Caddy receives a request for a new hostname.
2. Caddy calls `GET /api/tls/ask?domain=<hostname>`.
3. The app only returns `200` if:
   - hostname exists in `StatusPageDomain`,
   - verification status is `VERIFIED`,
   - linked status page is published.
4. Caddy issues certificate only when the ask endpoint allows it.

## Install Caddy (Ubuntu)

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

## Deploy Caddyfile

```bash
sudo cp docker/caddy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl status caddy
```

## Operational notes

- Keep Caddy `ask` endpoint reachable from the Caddy host.
- Monitor Let's Encrypt issuance rate and Caddy logs.
- Keep DNS verification flow enforced in dashboard before marking domains active.
