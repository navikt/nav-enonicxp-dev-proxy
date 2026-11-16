# Proxy til dev/prod miljøer for Enonic XP

Tiltenkt brukt ved frontend-utvikling for å slippe å kjøre hele XP-stacken vår lokalt.  

### Bruk

Krever pålogging på naisdevice eller tilsvarende for tilgang til interne applikasjoner.

Erstatt url for XP origin i appen du kjører lokalt med en av disse:

**dev:** `https://nav-enonicxp-proxy.intern.dev.nav.no/dev1`

**dev2/q6:** `https://nav-enonicxp-proxy.intern.dev.nav.no/dev2`

**prod:** `https://nav-enonicxp-proxy.intern.nav.no/prod`

## Metrikker og alerts

Prometheus-metrikker ligger på `/internal/metrics` (se `src/metrics.ts`), alle med prefikset `nav_enonicxp_dev_proxy_`:

- `requests_total{env, status}`: proxyede requests per XP-miljø og statusklasse (`2xx`–`5xx`), eller `network_error` når XP ikke svarte i det hele tatt. Ukjente miljøer telles som `env="invalid"`.
- `request_duration_seconds{env}`: responstid per XP-miljø.

Alerts er definert i `.nais/alerts.yml` og deployes kun til prod-gcp av `deploy.prod.yml`.

## Utvikling

`pnpm build && pnpm test` kjører testene mot bygget i `dist`.


## Prodsetting
Lag en PR til main, og merge inn etter godkjenning (En automatisk release vil oppstå ved deploy til main)
