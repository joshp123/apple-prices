# Apple Prices

A world map of Apple hardware prices, including tax.

## Deploy

The public ChatGPT Site is identified by `.openai/hosting.json`. DNS is managed in `opentofu-infra/websites/jjpcodes.com`.

From a clean checkout with the snapshot committed, install dependencies and build using the project environment:

```sh
devenv shell -- npm ci --prefix hosting
devenv shell -- node hosting/build.mjs
```

Obtain a fresh credential with Sites `create_source_repository_write_credential`. Run `devenv shell -- node ~/.codex/plugins/cache/openai-curated-remote/sites/1.1.6/scripts/site-workflow.mjs --project-id appgprj_6af84a2658048191b69d68192543e077`. At its hidden stdin prompt, send `{"credential": <returned credential object>, "commands": [], "archivePath": "/tmp/apple-prices-sites.tar.gz"}`. Never put the credential in a file or shell argument. Pass the helper's exact `project_id`, `commit_sha` and `archive` to Sites `save_site_version`, then its returned version ID to `deploy_site_version`. Preserve the public audience. Push the same source to GitHub.
