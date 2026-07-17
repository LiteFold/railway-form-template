FROM postgres:16-alpine

# Upstream postgres image entrypoint (docker-entrypoint.sh) handles initdb + start automatically
# when POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB are set.
#
# Volume mount geometry (configured via the Railway template editor's Volume widget, NOT via
# this Dockerfile): mount the volume at the PARENT path `/var/lib/postgresql` and set
# PGDATA=/var/lib/postgresql/data. The volume's ext4 `lost+found/` then lives at
# `/var/lib/postgresql/lost+found` (outside PGDATA) — initdb sees an empty `/var/lib/postgresql/data`
# and proceeds. This sidesteps the postgres-ssl:18 lost+found crash while still persisting data.
#
# We deliberately do NOT use `ghcr.io/railwayapp-templates/postgres-ssl:18`: that image's custom
# entrypoint enforces PGDATA must start with the volume mount path, forcing `/var/lib/postgresql/data`
# and trapping `lost+found/` inside PGDATA — every fresh marketplace deploy would crash on initdb.
# See .agents/skills/railway-deployment/references/plausible-ce-and-postgres-docker-patterns.md
# "Lost+Found Gotcha — Empirically Verified 2026-07-08" for the full root cause analysis.
