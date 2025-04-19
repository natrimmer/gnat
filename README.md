# gnat.blog

## About

TypeScript static site generator with component architecture. Produces zero JavaScript output. Parallel processing of different content types. Components support nested inclusion.

## Deployment

Cloudflare 🤘

## Bluesky Integration

The site includes automated syncing of Bluesky posts to the feed section. The sync process runs on a dedicated server and requires:

- Node.js 20.x
- jq (for JSON processing)
- Git
- curl

### Environment Variables

The sync process requires the following environment variables in a `.env` file:

```
BLUESKY_IDENTIFIER=your.handle
BLUESKY_PASSWORD=your_password
MATRIX_HOMESERVER=https://matrix.org
MATRIX_ROOM_ID=your_room_id
MATRIX_ACCESS_TOKEN=your_access_token
```

### Matrix Setup

The sync process sends notifications to a Matrix room. To set this up:

1. Create a dedicated Matrix bot account (e.g. `@gnat_bot:matrix.org`)
2. Create a room for notifications
3. Go to Settings -> Help & About to find your access token
4. Note your room ID (starts with !)
5. Add these credentials to your `.env` file

Using a dedicated bot account allows you to receive server notifications on any device with a Matrix client, including mobile push notifications. This makes it easy to monitor the sync process from anywhere.

The bot account is also used for Git commits on the server, making it clear which commits were automated vs manual. You'll see these commits in the repo history as:

```
Auto-sync Bluesky posts [2025-02-15 17:58:26]
```

### Server Setup

1. Clone the repository
2. Install dependencies
3. Make the sync script executable: `chmod +x scripts/bluesky_sync.sh`
4. Set up a cron job to run the sync periodically. For daily synchronization at midnight:
   ```bash
   0 0 * * * /gnat/scripts/bluesky_sync.sh
   ```

## License Information

This repository contains both software and content under different licenses:

### Software

The static site generator code (build scripts, components, and utilities) is licensed under the GNU General Public License v3.0. This includes:

- `/src/build/*.ts`
- `/src/utils/*.ts`
- `/src/*.ts`
- `tailwind.config.js`
- `tsconfig.json`

See [LICENSE.code](LICENSE.code)

### Content

The written content (articles, notes, feed, and other text) is licensed under Creative Commons Attribution 4.0 International (CC BY 4.0). This includes:

- `/src/content/*`
- `/src/components/*`
- `/public/articles/*`
- `/public/notes/*`
- `/public/feed/*`

See [LICENSE.content](LICENSE.content)

Note: Font files in `/public/fonts/` retain their original licenses.
