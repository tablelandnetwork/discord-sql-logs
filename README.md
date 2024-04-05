# Tableland SQL Logs Discord Bot

[![License](https://img.shields.io/github/license/tablelandnetwork/discord-sql-logs.svg)](./LICENSE)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg)](https://github.com/RichardLitt/standard-readme)

> A Discord bot that posts Tableland SQL events on a cron schedule & replicates the SQLite to Textile Basin

## Table of Contents

- [Background](#background)
- [Usage](#usage)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Background

This project runs a simple webhook-based Discord bot that fetches SQL logs from a Tableland validator node and posts them to a Discord channel. It is designed to be run on a cron schedule with GitHub Actions, which will execute fetching new logs, saving the latest data in a local SQLite database, replicating the database to [Textile Basin](https://github.com/tablelandnetwork/basin-cli), and then posting the new logs to a Discord channel. For each run, it reads fetches the latest SQLite state from Basin and compares it against new events to determine if posting to Discord should occur or not.

## Usage

First, clone this repo:

```sh
https://github.com/tablelandnetwork/discord-sql-logs
```

To get started, run `npm install` and then `npm run build` command; this will compile the package to the `dist` directory. To run the app, you will need to set the following environment variables in your `.env` file:

- `DISCORD_BOT_TOKEN`: The Discord bot token comes from creating a bot in the Discord Developer Portal at [https://discord.com/developers/applications](https://discord.com/developers/applications) and getting a token under the `Bot` tab and `Reset Token` button.
- `DISCORD_WEBHOOK_ID_<INTERNAL|EXTERNAL>`, `DISCORD_WEBHOOK_TOKEN_<INTERNAL|EXTERNAL>`: These webhook variables come from the server's URL of the webhook, which you create in the Discord channel settings: `https://discord.com/api/webhooks/DISCORD_WEBHOOK_ID/DISCORD_WEBHOOK_TOKEN`. Note that each webhook is for a different channel, and the bot will separate messages based on if they are tables that are part of applications build by the Tableland team.
- `PRIVATE_KEY`: A private key for creating and writing to a Basin vault, which stores the SQLite database (retrieves it before each run, writes the database to the vault after each run).
- `NODE_ENV`: Optional, but can be set to `development` to run the bot in development mode. Otherwise, it will run in production mode.

A vault name must be set in the `basin-config.json` file and is then created for the private key provided, which also signs subsequent writes to the vault. For example, this bot uses the `sql_logs_bot_state.db` vault, but keep in mind that **vault names must be unique and cannot be reused**. If you'd like to see the events for this vault, it's owned by `0xc2c3d5FFB6d60FFA48abBAFadCEfDf2bD4FD1905` and [viewable here](https://basin.tableland.xyz/vaults/sql_logs_bot_state.db/events).

Once those are set, you can run the app with `npm run start`, and it will start the bot. First, it runs through initialization steps to fetch events from the vault, and then it begins post the latest SQL logs to the Discord channel's webhook. Note that it only runs once, so it will exit until you run it again manually—e.g., this repo uses a GitHub Action cron job and runs the app every 15 minutes.

## Development

Follow the steps in the [Usage](#usage) section to get started. In particular, you can set up a `.env` file with a `NODE_ENV=development` variable to run the bot in development mode, which will also run from the `src/` directory instead of the `dist/` directory. The development mode also requires you create a filename called `basin-config-dev.json` in the root directory with the same format as `basin-config.json` but with a different vault name.

There are also a few other commands you can use:

- `npm run build`: Compile the package to the `dist` directory.
- `npm run start`: Start the bot.
- `npm run dev`: Start the bot with development settings defined in `.env` and build from `src/`.
- `npm run lint`: Lint the codebase with `eslint` (along with the `lint:fix` option).
- `npm run prettier`: Prettify the code format with `prettier` (along with the `prettier:fix` option).
- `npm run format`: Both lint and format the codebase with `eslint` and `prettier`, also fixing any issues it can.
- `npm run clean`: Remove the `dist` and `coverage` folders.
- `npm run test` or `npm run coverage`: Run tests—currently, only for the `basin.js` file, which implements some cryptographic behavior for the Basin vault.

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT AND Apache-2.0, © 2021-2024 Tableland Network Contributors
