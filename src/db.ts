import Database from "better-sqlite3";
import { type Database as DatabaseType } from "better-sqlite3";
import { type State } from "./utils.js";

// Initialize the SQLite `state` database and table.
export function initDb(path: string): void {
  const db = new Database(path, { verbose: console.log });
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      chain_id INTEGER NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      PRIMARY KEY (chain_id, block_number)
    );
  `);
}

// Insert the latest blocks processed by each chain into the SQLite `state` table.
export function insertStateLatestBlocks(
  db: DatabaseType,
  state: State[]
): void {
  try {
    for (const { chainId, blockNumber, timestamp } of state) {
      db.prepare(
        "INSERT OR IGNORE INTO state (chain_id, block_number, timestamp) VALUES (?, ?, ?)"
      ).run(chainId, blockNumber, timestamp);
    }
  } catch (err: any) {
    if (
      err.message ===
      "UNIQUE constraint failed: state.chain_id, state.block_number"
    ) {
      console.error("Latest block already indexed");
    } else {
      console.error("Error in insertLatestBlocks:", err.message);
    }
  }
}

// Get the latest blocks processed by each chain from the SQLite `state` table.
export function getStateMaxBlockNumbers(db: DatabaseType): State[] {
  const query = db.prepare(
    "SELECT chain_id as chainId, max(block_number) AS blockNumber, timestamp FROM state GROUP BY chainId"
  );
  return query.all() as State[];
}
