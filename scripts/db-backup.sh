#!/bin/sh

set -e

echo "Starting database backup process..."

# Define file names
BACKUP_FILE="backup-$(date +%Y-%m-%d-%H%M%S).sql.gz"
BACKUP_PATH="/tmp/${BACKUP_FILE}"

# Dump Database
echo "Dumping database ${PGDATABASE}..."
pg_dump -h "${PGHOST}" -U "${PGUSER}" -d "${PGDATABASE}" -F p | gzip > "${BACKUP_PATH}"

echo "Database dump complete. Size: $(du -sh ${BACKUP_PATH} | cut -f1)"

# Check GCS Configuration
if [ -z "${GCS_BUCKET}" ]; then
  echo "WARNING: GCS_BUCKET environment variable is not set. Backup file will remain locally in /tmp."
  exit 0
fi

if [ ! -f "${GOOGLE_APPLICATION_CREDENTIALS}" ]; then
  echo "ERROR: Google Cloud credentials file not found at ${GOOGLE_APPLICATION_CREDENTIALS}"
  echo "Backup failed to upload to GCS."
  exit 1
fi

# Authenticate with Google Cloud Service Account
echo "Authenticating with Google Cloud Service Account..."
gcloud auth activate-service-account --key-file="${GOOGLE_APPLICATION_CREDENTIALS}"

# Upload to Google Cloud Storage
echo "Uploading backup to Google Cloud Storage: gs://${GCS_BUCKET}/${BACKUP_FILE}..."
gcloud storage cp "${BACKUP_PATH}" "gs://${GCS_BUCKET}/${BACKUP_FILE}"

# Clean up local file
echo "Cleaning up local backup file..."
rm "${BACKUP_PATH}"

echo "Database backup uploaded successfully to GCS! ✅"
