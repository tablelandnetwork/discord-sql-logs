import { helpers } from "@tableland/sdk";
import type { BlockRange, ChainType, SqlLogsData, State } from "./utils.js";
import { fetchWithRetry } from "./utils.js";

// Set up SQL statement for getting the latest blocks processed by each chain.
// Note they will differ between testnet and mainnet to remove old testnet
// chains.
const sqlLatestBlocksByChain = (type: ChainType): string => {
  if (type === "testnet") {
    // Ignore deprecated testnet chains
    return encodeURIComponent(`
      SELECT
        chain_id,
        max(block_number) as block_number,
        timestamp
      FROM
        system_evm_blocks
      WHERE 
        chain_id != 421613 AND chain_id != 5 AND chain_id != 3141
      GROUP BY
        chain_id;
    `);
  } else if (type === "mainnet") {
    return encodeURIComponent(`
      SELECT
        chain_id,
        max(block_number) as block_number,
        timestamp
      FROM
        system_evm_blocks
      GROUP BY
        chain_id;
    `);
  } else {
    throw new Error("Invalid chain type");
  }
};

// Get the latest blocks processed by each chain.
export const getTblLatestBlocksByChain = async (): Promise<State[]> => {
  const testnetsUrl = helpers.getBaseUrl(80001);
  const mainnetsUrl = helpers.getBaseUrl(1);
  const testnetsResponse = await fetchWithRetry(
    `${testnetsUrl}/query?statement=${sqlLatestBlocksByChain("testnet")}`
  );
  const mainnetsResponse = await fetchWithRetry(
    `${mainnetsUrl}/query?statement=${sqlLatestBlocksByChain("mainnet")}`
  );
  const testnets: State[] = await testnetsResponse.json();
  const mainnets: State[] = await mainnetsResponse.json();

  return [...testnets, ...mainnets];
};

// Set up SQL statement for getting the latest SQL logs for each chain. The data
// returned will be used to check for new SQL logs and remove unnecessary
// healthbot updates and also dictate Discord post formatting.
const sqlGetNewSqlLogs = (range: BlockRange) =>
  encodeURIComponent(`
    SELECT
      chain_id,
      block_number,
      tx_hash,
      event_type,
      json_extract(event_json,'$.Caller') as caller,
      json_extract(event_json,'$.TableId') as table_id,
      json_extract(event_json,'$.Statement') as statement
    FROM
      system_evm_events
    WHERE 
      block_number > ${range.prev_block_number} AND 
      block_number <= ${range.block_number} AND 
      chain_id = ${range.chain_id} AND
      (event_type = 'ContractCreateTable' OR event_type = 'ContractRunSQL')
    ORDER BY
      block_number ASC;
  `);

// Check if there was an error in the query, which changes which variables will
// be defined in the Discord post.
async function checkStatementErrors(
  log: SqlLogsData
): Promise<string | undefined> {
  const response = await fetchWithRetry(
    `${log.base_url}/receipt/${log.chain_id}/${log.tx_hash}`
  );
  const { error } = await response.json();
  return error;
}

// Get the table name from the table ID—and if a 404 occurs, assume a table
// creation error.
async function getTableName(
  baseUrl: string,
  chainId: number,
  tableId: number
): Promise<string | undefined> {
  try {
    const response = await fetchWithRetry(
      `${baseUrl}/tables/${chainId}/${tableId}`
    );
    const json = await response.json();
    return json.name;
  } catch (err) {
    // If a CREATE TABLE event failed, make 404 response -> undefined
    return undefined;
  }
}

// Extract SQL logs from the query response and format them for Discord posts.
async function extractSqlLogsFromQuery(
  response: Response,
  baseUrl: string
): Promise<SqlLogsData[]> {
  const json = await response.json();
  const data = [];
  for await (const item of json) {
    // Ignore healthbot table updates
    if (!item.statement.match(/update healthbot/)) {
      const tableName = await getTableName(
        baseUrl,
        item.chain_id,
        item.table_id
      );
      const log: SqlLogsData = {
        chain_id: item.chain_id,
        block_number: item.block_number,
        tx_hash: item.tx_hash,
        event_type: item.event_type,
        caller: item.caller !== null ? item.caller : undefined, // Make sure `null` mapped to `undefined`
        table_id: item.table_id,
        table_name: tableName,
        statement: item.statement,
        base_url: baseUrl,
      };
      // Check if there was an error in the query
      const error = await checkStatementErrors(log);
      if (error !== undefined) {
        log.error = error;
      }
      data.push(log);
    }
  }
  return data;
}

// Get the latest SQL logs for each chain.
export async function getTblNewSqlLogs(
  ranges: BlockRange[]
): Promise<SqlLogsData[]> {
  const logs = [];
  for (const range of ranges) {
    const baseUrl = helpers.getBaseUrl(range.chain_id);
    const response = await fetch(
      `${baseUrl}/query?statement=${sqlGetNewSqlLogs(range)}`
    );
    const data = await extractSqlLogsFromQuery(response, baseUrl);
    logs.push(...data);
  }
  return logs;
}
