# Bet Stop Blocklist

Your repository, not StevenBlack, is the URL the Bet Stop extension should fetch.

## What the GitHub Action does

Every Monday at **04:17 UTC**, `.github/workflows/update-blocklist.yml`:

1. Runs the Node.js tests.
2. Downloads StevenBlack's **gambling-only** `hosts` variant.
3. Verifies it is the correct list and checks plausible size (2,000–30,000 domains).
4. Rejects a drop greater than 20% compared with your previous upstream snapshot.
5. Combines **your previous committed `hosts`**, new upstream entries, and `data/local-domains.txt`.
6. Removes explicitly listed false positives in `data/allowlist.txt`.
7. Saves **`hosts`** (the public list) and **`data/upstream-snapshot.hosts`** (your own backup) **as actual Git commits** when changed.

**If upstream returns 404, is removed, or fetches malformed data, the workflow fails without publishing anything.** Your prior committed files remain available. No run-time dependency on StevenBlack exists for installed extensions, provided the extension fetches your URL instead of theirs.

**Append-only by default:** Upstream deletion does not remove previously published domains. To remove a false positive, add it to `data/allowlist.txt` and run the workflow again.

## First setup

1. Publish these files to a **public** repository, e.g. `YOUR_USERNAME/bet-stop-blocklist` (default branch: `main`).
2. Optionally import your extension's existing curated domains:
   ```bash
   node scripts/import-existing.mjs ../bet-stop/blocked-domains.js
   ```
3. Open **Actions → Update gambling blocklist → Run workflow** (offline unchecked) to create the **first** `hosts` and `data/upstream-snapshot.hosts` files.
4. Confirm both files are committed to your GitHub repository. You now own a mirror independent of subsequent upstream availability.
5. Set your extension feed URL to:
   ```text
   https://raw.githubusercontent.com/YOUR_USERNAME/bet-stop-blocklist/main/hosts
   ```
6. In `manifest.json`, make sure the appropriate host permission for `https://raw.githubusercontent.com/*` is declared for fetching updates. Keep your bundled local list and cached dynamic rules as backup.

### If the upstream disappears later

- **Installed users keep working:** they fetch the last committed `hosts` from *your* repository.
- **Automatic update reports an error:** it cannot retrieve new domains, but does not delete the list.
- **You can still add or remove domains:** edit `data/local-domains.txt` or `data/allowlist.txt`, then use **Actions → Run workflow → offline: true**. That rebuilds from your saved snapshot without contacting StevenBlack.
- The snapshot and Git history give you a second copy and version history.

### Test locally

```bash
npm test
node scripts/update.mjs
# Rebuild without external network (after at least one successful sync):
node scripts/update.mjs --offline
```

### Permissions / protected branches

The Action requests `contents: write` for the built-in `GITHUB_TOKEN`, no personal access token required. If branch rules prevent Actions from pushing, configure repository rules or use an approved pull-request workflow. You can inspect results under Actions → Update gambling blocklist.

### Reliability and licensing

- **The first sync must succeed while the upstream is still available**; this starter does not ship the upstream's 6,744-domain list.
- Github may automatically disable scheduled workflows in inactive public repositories after 60 days; periodically verify that the schedule is active.
- The extension may require a separate release to change its hardcoded feed URL to your repository.
- Read `SOURCES.md` and preserve license notices; mirroring open-source data does not transfer authorship or license ownership.
- Because the list is append-only, stale domains can linger. Review false-positive reports and manage `data/allowlist.txt` accordingly.
