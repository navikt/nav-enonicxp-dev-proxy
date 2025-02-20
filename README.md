# Proxy til dev/prod miljøer for Enonic XP

Tiltenkt brukt ved frontend-utvikling for å slippe å kjøre hele XP-stacken vår lokalt.  

### Bruk

Krever pålogging på naisdevice eller tilsvarende for tilgang til interne applikasjoner.

Erstatt url for XP origin i appen du kjører lokalt med en av disse:

**dev:** `https://nav-enonicxp-proxy.intern.dev.nav.no/dev1`

**dev2/q6:** `https://nav-enonicxp-proxy.intern.dev.nav.no/dev2`

**prod:** `https://nav-enonicxp-proxy.intern.nav.no/prod`


## Prodsetting
Lag en PR til main, og merge inn etter godkjenning (En automatisk release vil oppstå ved deploy til main)
