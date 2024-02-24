# Tableland SQL Logs Discord Bot

[![License](https://img.shields.io/github/license/tablelandnetwork/js-template.svg)](./LICENSE)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg)](https://github.com/RichardLitt/standard-readme)

> A Discord bot that posts Tableland SQL events on a cron schedule

## Table of Contents

- [Background](#background)
- [Usage](#usage)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Background

This project runs a simple webhook-based Discord bot that fetches SQL logs from a Tableland validator node and posts them to a Discord channel. It is designed to be run on a cron schedule with GitHub Actions, which will execute fetching new logs, saving the latest data in a local SQLite database, and then posting the new logs to a Discord channel. For each run, it reads the SQLite state and compares it against new events to determine if posting to Discord should occur or not.

## Usage

First, clone this repo:

```sh
git clone https://github.com/tablelandnetwork/ts-template
```

To get started, run `npm install` and then `npm run build` command; this will compile the package to the `dist` directory. In `src/index.ts`, there is a basic example of the aforementioned database functionality. A table is created, written to with a single value `hello`, and then exports this value after reading it from the table.

## Development

Use the command `npm run up`, which runs `npm install`, the `build` command, and then spins up a Local Tableland node (the `lt` command). You can then use the output files in the `dist` directory against a local-only Tableland network.

This project also comes with [`mocha`](https://mochajs.org/) and tests already set up. Running `npm test` will spin up a local node (see: `test/setup.ts`), run the tests against the Local Tableland network, and then shut down the local node upon test completion. Coverage tests with [`c8`](https://github.com/bcoe/c8) are also included, and can be run with `npm run coverage` command to output a coverage report to the `coverage` directory.

There are also a few other commands you can use:

- `npm run lint`: Lint the codebase with `eslint` (along with the `lint:fix` option).
- `npm run prettier`: Prettify the code format with `prettier` (along with the `prettier:fix` option).
- `npm run format`: Both lint and format the codebase with `eslint` and `prettier`, also fixing any issues it can.
- `npm run clean`: Remove the `dist` and `coverage` folders.

## Contributing

PRs accepted.

Small note: If editing the README, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

MIT AND Apache-2.0, © 2021-2023 Tableland Network Contributors
