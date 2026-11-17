# Bet Stop — plain-domain `hosts` update

Target repository: `ynformed-solutions/bet-stop-blocklist`.

## Repository change

Replace **only** these two files in your blocklist repository:

- `scripts/update.mjs`
- `tests/update.test.mjs`

No workflow modification is needed: the existing `.github/workflows/update-blocklist.yml` already commits the `hosts` path.

Run `npm test`, then open **Actions → Update gambling blocklist → Run workflow** on `main`, with offline unchecked.

The Action overwrites `hosts` with one domain per line, sorted and deduplicated, while preserving `data/upstream-snapshot.hosts` in its original hosts-file format. It retains your existing domains, including domains from the old `0.0.0.0 domain` format, and applies local additions and exclusions.

**Do not overwrite any of your existing `data/` files** or generated `hosts` file manually. The workflow regenerates `hosts` for you.

## Extension compatibility

The **earlier `gambling-feed.js` template** provided in our conversation expects `0.0.0.0` and StevenBlack-specific comments. It **cannot read the new plain-domain output**. The `extension/gambling-feed.js` file in this archive is a compatible replacement for that earlier template, using your repository URL and accepting plain-domain or classic hosts lines.

If your VS Code Codex project has since modified `gambling-feed.js`, **do not blindly replace it**. Instead, adapt its parser so that `example.com` on its own line is accepted; remove the old metadata check, retain validation and cached-rule fallback, and set the feed URL to:

`https://raw.githubusercontent.com/ynformed-solutions/bet-stop-blocklist/main/hosts`

Update the extension parser **before** switching the published `hosts` format if installed clients are already using your repository. Existing clients otherwise retain their cached rules but will not receive new domains until the parser is updated via the Chrome Web Store.

## Tests

The repository tests exercise migration from the old format, invalid-upstream rejection, append-only preservation, offline fallback, allowlist behavior and domain-only output.
