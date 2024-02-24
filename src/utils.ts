export interface State {
  chain_id: number;
  block_number: number;
  timestamp: number;
}

export type BlockRange = Pick<State, "chain_id" | "block_number"> & {
  prev_block_number: number;
};

export type ChainType = "mainnet" | "testnet";

export type SqlEventType = "ContractCreateTable" | "ContractRunSQL";

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

export function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len) + "..." : str;
}
