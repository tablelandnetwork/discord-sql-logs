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
