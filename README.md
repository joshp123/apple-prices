# Apple Prices

A world map of Apple hardware prices, including tax.

## Data

`data/price-snapshot.binpb` is one `PriceSnapshot` (see `proto/apple_prices/v1/price_snapshot.proto`): every flagship Apple product's standard configurations and their prices in Apple's 40 online stores, Macau's published base prices, US state and Canadian provincial sales tax, California's recycling fee, and exchange rates. `src/take-home-prices.ts` turns it into what you pay with tax in each country, state or province. Product photos come from Apple's image server; the snapshot holds each product's image address.

Prices come only from Apple's own pages. US sales tax is the Tax Foundation's population-weighted average of state and local rates (mid-2026); Canadian tax is the Canada Revenue Agency's GST/HST plus provincial sales tax. Canadian provincial recycling fees are not included.

Refresh it, then check a random sample against Apple's part pages:

```sh
devenv shell -- npm install
devenv shell -- node tools/scrape-apple-prices.ts
devenv shell -- node tools/check-prices-against-apple.ts 3
```

A full scrape takes 15 to 60 minutes, because Apple throttles bursts of requests. It refuses to write a snapshot if a price it had last time is now missing; rerun it, or pass `--accept-missing-prices` once you have checked Apple's page. `devenv shell -- node tools/print-snapshot.ts [product-id]` prints coverage.

## Deploy

The public ChatGPT Site is identified by `.openai/hosting.json`. DNS is managed in `opentofu-infra/websites/jjpcodes.com`.

From a clean checkout after committing changes, install dependencies and build using the project environment:

```sh
devenv shell -- npm ci
devenv shell -- node hosting/build.mjs
```

Obtain a fresh credential with Sites `create_source_repository_write_credential`. Run `devenv shell -- node ~/.codex/plugins/cache/openai-curated-remote/sites/1.1.6/scripts/site-workflow.mjs --project-id appgprj_6af84a2658048191b69d68192543e077`. At its hidden stdin prompt, send `{"credential": <returned credential object>, "commands": [], "archivePath": "/tmp/apple-prices-sites.tar.gz"}`. Never put the credential in a file or shell argument. Pass the helper's exact `project_id`, `commit_sha` and `archive` to Sites `save_site_version`, then its returned version ID to `deploy_site_version`. Preserve the public audience. Push the same source to GitHub.
