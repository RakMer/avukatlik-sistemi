#!/bin/sh

# NOTE: Do NOT use set -e here.
# The initial verification backup may fail (e.g., postgres not ready yet on first boot)
# and we don't want the container to exit. Crond must keep running.

# Write cron schedule to crontab
CRON_SCHEDULE=${BACKUP_CRON:-"0 3 * * *"}

echo "Configuring backup cron job with schedule: ${CRON_SCHEDULE}"
printf "%s /scripts/db-backup.sh > /proc/1/fd/1 2>&1\n" "${CRON_SCHEDULE}" > /etc/crontabs/root

# Wait a few seconds to let postgres start up on first run
echo "Waiting 10 seconds before initial backup attempt..."
sleep 10

# Execute once on startup to verify setup (failure is non-fatal)
echo "Executing initial verification backup..."
/scripts/db-backup.sh || echo "Initial backup test failed. This is non-fatal — crond will retry on schedule."

echo "Starting cron daemon..."
exec crond -f -l 2
