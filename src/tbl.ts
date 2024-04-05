import { helpers } from "@tableland/sdk";
import type {
  BlockRange,
  ChainType,
  FilteredLogGroups,
  SqlLogsData,
  SqlLogsQueryResponse,
  State,
} from "./utils.js";
import { fetchWithRetry, checkTableInFilterList } from "./utils.js";

// Set up SQL statement for getting the latest blocks processed by each chain.
// Note they will differ between testnet and mainnet to remove old testnet
// chains.
const sqlLatestBlocksByChain = (type: ChainType): string => {
  if (type === "testnet") {
    // Ignore deprecated testnet chains
    return encodeURIComponent(`
      SELECT
        chain_id as chainId,
        max(block_number) as blockNumber,
        timestamp
      FROM
        system_evm_blocks
      WHERE 
        chainId != 421613 AND chainId != 5 AND chainId != 3141 AND chainId != 420
      GROUP BY
        chainId;
    `);
  } else if (type === "mainnet") {
    return encodeURIComponent(`
      SELECT
        chain_id as chainId,
        max(block_number) as blockNumber,
        timestamp
      FROM
        system_evm_blocks
      GROUP BY
        chainId;
    `);
  } else {
    throw new Error("invalid chain type");
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
const sqlGetNewSqlLogs = (range: BlockRange): string =>
  encodeURIComponent(`
    SELECT
      chain_id as chainId,
      block_number as blockNumber,
      tx_hash as txHash,
      event_type as eventType,
      json_extract(event_json,'$.Caller') as caller,
      json_extract(event_json,'$.TableId') as tableId,
      json_extract(event_json,'$.Statement') as statement
    FROM
      system_evm_events
    WHERE 
      blockNumber > ${range.prevBlockNumber} AND 
      blockNumber <= ${range.blockNumber} AND 
      chainId = ${range.chainId} AND
      (eventType = 'ContractCreateTable' OR eventType = 'ContractRunSQL')
    ORDER BY
      blockNumber ASC;
  `);

// Check if there was an error in the query, which changes which variables will
// be defined in the Discord post.
async function checkStatementErrors(
  log: SqlLogsData
): Promise<string | undefined> {
  const response = await fetchWithRetry(
    `${log.baseUrl}/receipt/${log.chainId}/${log.txHash}`
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

function isInternalLog(log: SqlLogsData): boolean {
  // Assume table creation errors are external issues
  if (log.tableName === undefined) return false;
  const shouldFilter = checkTableInFilterList(log.tableName);
  return shouldFilter;
}

// Extract SQL logs from the query response and format them for Discord posts.
async function extractSqlLogsFromQuery(
  response: SqlLogsQueryResponse[],
  baseUrl: string
): Promise<FilteredLogGroups> {
  const internalLogs = [];
  const externalLogs = [];
  for await (const item of response) {
    // Ignore healthbot table updates
    if (item.statement.match(/update healthbot/) === null) {
      const tableName = await getTableName(baseUrl, item.chainId, item.tableId);

      const log: SqlLogsData = {
        chainId: item.chainId,
        blockNumber: item.blockNumber,
        txHash: item.txHash,
        eventType: item.eventType,
        caller: item.caller !== null ? item.caller : undefined, // Make sure `null` mapped to `undefined`
        tableId: item.tableId,
        tableName,
        statement: item.statement,
        baseUrl,
      };
      // Check if there was an error in the query
      const error = await checkStatementErrors(log);
      if (error !== undefined) {
        log.error = error;
      }
      const isInternal = isInternalLog(log);
      isInternal ? internalLogs.push(log) : externalLogs.push(log);
    }
  }
  return { internal: internalLogs, external: externalLogs };
}

// Get the latest SQL logs for each chain.
export async function getTblNewSqlLogs(
  ranges: BlockRange[]
): Promise<FilteredLogGroups> {
  const logs: FilteredLogGroups[] = [];
  for (const range of ranges) {
    const baseUrl = helpers.getBaseUrl(range.chainId);
    const response = await fetch(
      `${baseUrl}/query?statement=${sqlGetNewSqlLogs(range)}`
    );
    const json: SqlLogsQueryResponse[] = await response.json();
    const data: FilteredLogGroups = await extractSqlLogsFromQuery(
      json,
      baseUrl
    );
    logs.push(data);
  }

  const combinedLogs = logs.reduce<FilteredLogGroups>(
    (acc, logGroup) => {
      acc.internal = acc.internal.concat(logGroup.internal);
      acc.external = acc.external.concat(logGroup.external);
      return acc;
    },
    { internal: [], external: [] }
  );

  return combinedLogs;
}
