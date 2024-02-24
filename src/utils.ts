// Defines the interface for `state` table and associated types.
export interface State {
  chain_id: number;
  block_number: number;
  timestamp: number;
}

// Defines the range for how the latest state and most recent state diff
// compare.
export type BlockRange = Pick<State, "chain_id" | "block_number"> & {
  prev_block_number: number;
};

// Defines the chain type for the mainnets or testnets to dictate a base URL.
export type ChainType = "mainnet" | "testnet";

// Defines the event type for SQL logs to parse.
export type SqlEventType = "ContractCreateTable" | "ContractRunSQL";

// Defines the data for SQL logs to be used in Discord embeds.
export interface SqlLogsData {
  chain_id: number;
  block_number: number;
  tx_hash: string;
  event_type: SqlEventType;
  caller: string | undefined;
  table_id: number;
  table_name: string | undefined;
  statement: string;
  base_url: string;
  error?: string;
}

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
          prevItem.chain_id === nextItem.chain_id &&
          prevItem.block_number === nextItem.block_number &&
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
      (ps) => ps.chain_id === diffItem.chain_id
    );
    // This should always have a previous block num
    const prev_block_number = prevStateItem
      ? prevStateItem.block_number
      : diffItem.block_number;

    return {
      chain_id: diffItem.chain_id,
      block_number: diffItem.block_number,
      prev_block_number,
    };
  });
  return extendedDiff;
}

// Fetches data from a URL and retries if the response is a 429.
export async function fetchWithRetry(url: string, retries = 5, backoff = 300) {
  try {
    const response = await fetch(url);

    if (response.status === 429 && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, retries - 1, backoff * 2);
    }
    if (!response.ok) {
      throw new Error(`Error fetching data: ${response.status}`);
    }

    return response;
  } catch (err) {
    throw err;
  }
}

// Truncates a string to a specified length (needed for Discord embeds).
export function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len) + "..." : str;
}
