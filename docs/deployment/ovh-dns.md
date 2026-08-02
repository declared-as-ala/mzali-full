# OVH DNS Configuration

## Records to create

In the OVH Control Panel: **Web Cloud → Domains → ahmedmzaliboutique.tn →
DNS Zone → Add an entry**, create these six `A` records, all pointing to the
VPS's public IPv4:

| Subdomain | Type | Target |
|---|---|---|
| `@` | A | `149.202.34.65` |
| `www` | A | `149.202.34.65` |
| `admin` | A | `149.202.34.65` |
| `pos` | A | `149.202.34.65` |
| `api` | A | `149.202.34.65` |
| `media` | A | `149.202.34.65` |

Equivalent zone-file view:

```
@       A    149.202.34.65
www     A    149.202.34.65
admin   A    149.202.34.65
pos     A    149.202.34.65
api     A    149.202.34.65
media   A    149.202.34.65
```

Set TTL to the OVH default (usually 3600s / 1h) unless you're actively
migrating — lower it to 300s only during the DNS cutover window itself, then
raise it back.

## No AAAA records

Do not add IPv6 (`AAAA`) records unless you've separately verified the VPS
has a working IPv6 address *and* your UFW rules explicitly allow it. An
`AAAA` record with no working IPv6 firewall path causes intermittent
failures for IPv6-preferring clients (they try IPv6 first, time out, then
fall back to IPv4 — slow, and Let's Encrypt's own validation can pick either
path).

## DNS must resolve before requesting certificates

Caddy requests Let's Encrypt certificates automatically on first request to
each domain (`caddy` service in `deploy/docker-compose.prod.yml`), via
HTTP-01 challenge over port 80. This means, for every domain:

1. The `A` record must already resolve to `149.202.34.65` from the public
   internet (not just your own machine — OVH's own recursive resolvers and
   Let's Encrypt's validation servers must see it).
2. Port 80 must be reachable from the internet (UFW allows it — see the
   bootstrap script).
3. Only then will `caddy up` succeed in issuing a cert for that domain.

**Verify propagation before starting containers**, from a machine outside
your own network:

```
dig +short ahmedmzaliboutique.tn
dig +short www.ahmedmzaliboutique.tn
dig +short admin.ahmedmzaliboutique.tn
dig +short pos.ahmedmzaliboutique.tn
dig +short api.ahmedmzaliboutique.tn
dig +short media.ahmedmzaliboutique.tn
```

Every line must print `149.202.34.65`. If any is blank or shows something
else, wait — DNS propagation is typically minutes but can take longer
depending on your resolver's cache and the previous record's TTL if this
domain was in use before.

## Rate limits

Let's Encrypt limits certificate issuance per exact domain set to 5/week.
Don't repeatedly tear down and recreate the `caddy` container's volumes
(`caddy-data` holds the issued certificates) while testing — that throws
away valid certs and risks hitting the limit. `deploy.sh` never touches
these volumes on a normal deploy; only a manual `docker volume rm` would.
