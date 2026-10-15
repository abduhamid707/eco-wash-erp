# ECO WASH — Backup and recovery

The database is PostgreSQL, not Google Sheets. A copy of the source repository does **not** back up operational data.

## Manual backup
From the host running the beta Docker stack:

```bash
bash scripts/backup.sh
```

The script creates a PostgreSQL custom-format dump in `./backups`. Copy backups to an encrypted location outside the server. Avoid committing archives or exporting them to public folders.

## Restore
Stop business writes and take an additional backup first. Run on a staging clone:

```bash
bash scripts/restore.sh ./backups/eco-wash-YYYYMMDDTHHMMSSZ.dump
```

Restore into a staging environment before ever doing a production restore. The restore script prompts explicitly and stops the API.

## Release gate
- Scheduled encrypted backups with retention and off-site destination
- Weekly automatic verification that a backup can be restored
- Agreed recovery point objective and recovery time objective
- Production configuration for TLS, firewall, audit and secrets
- Documented incident escalation and access list

The scripts alone do not satisfy the production disaster-recovery requirement.
