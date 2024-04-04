import { existsSync, readFileSync } from "fs";
import dotenv from "dotenv";
dotenv.config({
  path: [".env.local", ".env"], // Load .env.local first, then .env
});

// Defines the interface for `state` table and associated types.
export interface State {
  chainId: number;
  blockNumber: number;
  timestamp: number;
}

// Defines the range for how the latest state and most recent state diff
// compare.
export type BlockRange = Pick<State, "chainId" | "blockNumber"> & {
  prevBlockNumber: number;
};

// Defines the chain type for the mainnets or testnets to dictate a base URL.
export type ChainType = "mainnet" | "testnet";

// Defines the event type for SQL logs to parse.
export type SqlEventType = "ContractCreateTable" | "ContractRunSQL";

// Defines query response that precedes the SQL logs extended data.
export interface SqlLogsQueryResponse {
  chainId: number;
  blockNumber: number;
  txHash: string;
  eventType: SqlEventType;
  caller: string | undefined;
  tableId: number;
  statement: string;
}

// Defines the data for SQL logs to be used in Discord embeds.
export interface SqlLogsData {
  chainId: number;
  blockNumber: number;
  txHash: string;
  eventType: SqlEventType;
  caller: string | undefined;
  tableId: number;
  tableName: string | undefined;
  statement: string;
  baseUrl: string;
  error?: string;
}

// Defines which SQL logs are filtered into internal and external channels.
export interface FilteredLogGroups {
  internal: SqlLogsData[];
  external: SqlLogsData[];
}

// Get environment variables for Discord webhooks and bot token.
export const getEnvVars = (): Record<string, string> => {
  const {
    DISCORD_WEBHOOK_ID_INTERNAL, // Only post internal core Tableland logs
    DISCORD_WEBHOOK_TOKEN_INTERNAL,
    DISCORD_WEBHOOK_ID_EXTERNAL, // Post logs from community devs
    DISCORD_WEBHOOK_TOKEN_EXTERNAL,
    DISCORD_BOT_TOKEN,
    PRIVATE_KEY,
    NODE_ENV,
  } = process.env;
  if (
    DISCORD_WEBHOOK_ID_INTERNAL == null ||
    DISCORD_WEBHOOK_TOKEN_INTERNAL == null ||
    DISCORD_WEBHOOK_ID_EXTERNAL == null ||
    DISCORD_WEBHOOK_TOKEN_EXTERNAL == null ||
    DISCORD_BOT_TOKEN == null ||
    PRIVATE_KEY == null
  ) {
    throw new Error("Discord environment variables not set");
  } else {
    return {
      DISCORD_WEBHOOK_ID_INTERNAL,
      DISCORD_WEBHOOK_TOKEN_INTERNAL,
      DISCORD_WEBHOOK_ID_EXTERNAL,
      DISCORD_WEBHOOK_TOKEN_EXTERNAL,
      DISCORD_BOT_TOKEN,
      PRIVATE_KEY,
      NODE_ENV: NODE_ENV ?? "production", // Default to production
    };
  }
};

// Get basin config file for the `vault` parameter.
export const getBasinConfig = (env: string): Record<string, string> => {
  const configFile =
    env === "production" ? "basin-config.json" : "basin-config-dev.json";
  if (!existsSync(configFile)) {
    throw new Error("basin config file not found");
  }
  const data = readFileSync(configFile, "utf8");
  if (data === "") {
    throw new Error("basin config file not set");
  } else {
    const config = JSON.parse(data);
    if (config.vault == null || config.vault === "") {
      throw new Error("vault not set");
    }
    return config;
  }
};

// Returns the difference between the previous state and the next state
// retrieved from a validator node's latest processed events.
export function findStateDiff(
  previousState: State[],
  nextState: State[]
): State[] {
  return nextState.filter(
    (nextItem) =>
      !previousState.some(
        (prevItem) =>
          prevItem.chainId === nextItem.chainId &&
          prevItem.blockNumber === nextItem.blockNumber &&
          prevItem.timestamp === nextItem.timestamp
      )
  );
}

// Returns the block range for SQL logs to be used in SQL queries and ensure
// only new events are posted to Discord.
export function getBlockRangeForSqlLogs(
  previousState: State[],
  diff: State[]
): BlockRange[] {
  const extendedDiff = diff.map((diffItem) => {
    const prevStateItem = previousState.find(
      (ps) => ps.chainId === diffItem.chainId
    );
    // This should always have a previous block num
    const prevBlockNumber = prevStateItem?.blockNumber ?? diffItem.blockNumber;

    return {
      chainId: diffItem.chainId,
      blockNumber: diffItem.blockNumber,
      prevBlockNumber,
    };
  });
  return extendedDiff;
}

// Fetches data from a URL and retries if the response is a 429.
export async function fetchWithRetry(
  url: string,
  retries = 5,
  backoff = 300
): Promise<Response> {
  const response = await fetch(url);

  if (response.status === 429 && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, backoff));
    return await fetchWithRetry(url, retries - 1, backoff * 2);
  }
  if (!response.ok) {
    throw new Error(`Error fetching data: ${response.status}`);
  }

  return response;
}

// Truncates a string to a specified length (needed for Discord embeds).
export function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len) + "..." : str;
}

// Checks if a table name is in the "internal" list, to be filtered out of
export function checkTableInFilterList(tableName: string): boolean {
  return tableLogsFilterList.includes(tableName);
}

// List of tables to put in an internal-only Discord logs channel (note:
// healthbot tables handled separately).
const tableLogsFilterList = [
  // Rigs testnet
  "rigs_contract_80001_7136",
  "rigs_allowlist_80001_7135",
  "parts_80001_4038",
  "layers_80001_4039",
  "rigs_314159_9",
  "rig_attributes_80001_4040",
  "deals_314159_8",
  "lookups_314159_10",
  "pilot_sessions_80001_7137",
  "ft_rewards_80001_7138",
  "proposals_80001_7139",
  "ft_snapshot_80001_7140",
  "votes_80001_7141",
  "options_80001_7142",
  "missions_80001_7223",
  "mission_contributions_80001_7224",
  // Rigs mainnet
  "rigs_contract_42161_12",
  "rigs_allowlist_42161_14",
  "parts_42161_7",
  "layers_42161_8",
  "rigs_314_3",
  "rig_attributes_42161_15",
  "deals_314_4",
  "lookups_314_5",
  "pilot_sessions_1_7",
  "ft_rewards_42161_18",
  "proposals_42161_19",
  "ft_snapshot_42161_20",
  "votes_42161_21",
  "options_42161_22",
  "missions_42161_23",
  "mission_contributions_42161_24",
  // Studio testnet (legacy)
  "migrations_421614_2",
  "deployments_421614_3",
  "environments_421614_4",
  "project_tables_421614_5",
  "projects_421614_6",
  "tables_421614_7",
  "team_invites_421614_8",
  "team_memberships_421614_9",
  "team_projects_421614_10",
  "teams_421614_11",
  "users_421614_12",
  // Studio testnet (new)
  "migrations_421614_453",
  "deployments_421614_454",
  "environments_421614_455",
  "project_tables_421614_456",
  "projects_421614_457",
  "tables_421614_458",
  "team_invites_421614_459",
  "team_memberships_421614_460",
  "team_projects_421614_461",
  "teams_421614_462",
  "users_421614_463",
  // Studio mainnet
  "migrations_42170_7",
  "deployments_42170_8",
  "environments_42170_9",
  "project_tables_42170_10",
  "projects_42170_11",
  "tables_42170_12",
  "team_invites_42170_13",
  "team_memberships_42170_14",
  "team_projects_42170_15",
  "teams_42170_16",
  "users_42170_17",
];
