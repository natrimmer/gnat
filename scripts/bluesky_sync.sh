#!/bin/bash

# Config
REPO_PATH="."
BRANCH="prod"
LOG_FILE="sync_bluesky.log"

# Function to load .env file
load_env() {
   if [ -f "$REPO_PATH/.env" ]; then
       export $(cat "$REPO_PATH/.env" | grep -v '^#' | xargs)
   else
       send_matrix_message "Error: .env file not found" "error"
       exit 1
   fi
}

# Function to send Matrix notification
send_matrix_message() {
   local msg_text="$1"
   local msg_type="$2"  # "error" or "success"

   if [ "$msg_type" = "error" ]; then
       msg_text="❌ Bluesky Sync Error: $msg_text"
   else
       msg_text="✅ Bluesky Sync: $msg_text"
   fi

   curl -XPOST \
       -d "{\"msgtype\":\"m.text\", \"body\":\"$msg_text\"}" \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer ${MATRIX_ACCESS_TOKEN}" \
       "${MATRIX_HOMESERVER}/_matrix/client/r0/rooms/${MATRIX_ROOM_ID}/send/m.room.message"
}

# Function to log with timestamp
log() {
   echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
   send_matrix_message "$1" "success"
}

# Function to update timestamp in JSON
update_timestamp() {
   local timestamps=$(cat "$REPO_PATH/service_timestamps.json")
   local new_timestamps=$(echo $timestamps | jq --arg ts "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" '.bluesky_last_sync = $ts')
   echo $new_timestamps > "$REPO_PATH/service_timestamps.json"
}

# Error handling
set -e
trap 'send_matrix_message "Script failed at line $LINENO. Check logs for details." "error"' ERR

# Go to repository and load environment variables
cd $REPO_PATH
load_env
log "Starting Bluesky sync process"

# Ensure we're on the right branch and up to date
git checkout $BRANCH
git pull
log "Pulled latest changes from $BRANCH"

# Install dependencies if needed
npm install
log "Installed dependencies"

# Build TypeScript
npx tsc
log "Built TypeScript files"

# Run the sync (environment variables are already loaded from .env)
node dist/build/bluesky_sync.js
log "Completed Bluesky sync process"

# Update timestamp
update_timestamp

# Check if there are changes to commit
if [[ -n $(git status -s) ]]; then
   git add .
   commit_msg="Auto-sync Bluesky posts [$(date +'%Y-%m-%d %H:%M:%S')]"
   git commit -m "$commit_msg"
   git push -f origin $BRANCH
   log "Changes committed and pushed: $commit_msg"
else
   log "No changes to commit"
fi

send_matrix_message "Sync completed successfully" "success"
