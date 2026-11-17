# Provenance and attribution

The first-party Bet Stop blocklist in `hosts` is generated using:

- [StevenBlack/hosts gambling-only hosts](https://github.com/StevenBlack/hosts/tree/master/alternates/gambling-only) (an aggregator of multiple community-maintained feeds).
- Additional domains manually curated by the Bet Stop project in `data/local-domains.txt`.
- Previously published domains retained across updates, with exceptions in `data/allowlist.txt`.

The upstream GitHub repository is distributed under MIT, but the upstream compilation incorporates third-party feeds. **Review the licenses and attribution for the particular feeds before redistribution**, particularly for commercial use. Keep the original upstream headers inside `data/upstream-snapshot.hosts`, and respect attribution requirements.

The name "Bet Stop" indicates the owner of this *distribution and update pipeline*, not authorship of all upstream domain data.
