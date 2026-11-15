# Tortuga menu

Public menu: https://kulakovsk.github.io/tortuga-menu/

The QR address stays unchanged. Supabase remains the source for the admin panel, current prices and availability.

## Resilient guest menu

`build-backup.cjs` creates `_site/` from the public, anonymous Supabase API. It embeds a complete menu snapshot in `index.html` and downloads photographs into `_site/photos/` on the same hosting as the menu. Image filenames contain a content hash. Archived dishes and their unused photo links are excluded.

The guest page starts from this snapshot immediately. Kitchen, bar and photo metadata refresh independently. Failed requests leave the last good data in place. The cart remains usable during an outage; a Russian, English or Chinese notice asks the guest to confirm prices and availability with the waiter. Known unavailable items stay unavailable. Orders are still shown to the waiter, never transmitted automatically.

Matching published photos use their local copy even while Supabase is available. Newly uploaded photos can appear directly from Supabase before the next backup publication; if that image fails, the last published photo for that dish is the fallback. A successfully loaded photo removal hides the old photo.

## Automatic updates

GitHub Pages uses **GitHub Actions**, not a branch build. `Refresh menu backup` runs on code pushes, manual dispatch and a five-minute schedule. It compares a fingerprint of all guest-visible data with `backup-manifest.json`. Unchanged scheduled runs skip photo downloads and deployment.

Every admin change is picked up by a later check; this is polling, not an immediate webhook. GitHub can delay scheduled jobs, so five minutes is not a delivery guarantee. Intermediate saves can be combined into one publication. The admin status compares the current data fingerprint with the deployed one and links to the workflow when publication is pending.

The builder downloads every current photo and reads the data again before publishing. If a request, image download or validation fails, or the menu changes during the build, deployment stops and the previous site stays live. The next scheduled check retries. No user token, service-role key or extra persistent credential is used. Publishing uses GitHub's temporary workflow token. A separate job makes a repository heartbeat commit after 25 quiet days so the schedule is not disabled by prolonged repository inactivity.

## Maintenance

- Edit guest synchronization in `guest-resilience.js`; the builder inserts it into the original HTML.
- Edit shared data fingerprinting in `backup-shared.js` and admin publication status in `backup-status.js`.
- Run `node build-backup.cjs` with Node 22 or newer to build locally. `_site/` is generated output.
- To retry a publication, open Actions → Refresh menu backup → Run workflow.
- To roll back application code, revert the relevant source commit and run the workflow. It will still obtain current menu data from Supabase.
- Restoring an old HTML file directly through a branch build would bypass the backup builder; keep the Pages source set to GitHub Actions.

Verified on 15 November 2026: complete server outage on first visit, partial catalog/photo failures, offline kitchen/options/bar/flavour cart, fresh prices and stops after recovery, new/removed photo fallback, older missing browser APIs, three languages, admin pending/current/error status, successful live publication and mobile layout.
