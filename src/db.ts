import Database from "better-sqlite3";
import { type Database as DatabaseType } from "better-sqlite3";
import { type State } from "./utils.js";

// Initialize the SQLite `state` database and table.
export function initDb(path: string): void {
  const db = new Database(path, { verbose: console.log });
  db.exec(`
    CREATE TABLE IF NOT EXISTS state (
      chain_id INTEGER PRIMARY KEY,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL
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
    if (err.message === "UNIQUE constraint failed: state.chain_id") {
      console.error("latest block already indexed");
    } else {
      console.error("error in insertLatestBlocks:", err.message);
    }
  }
}

// Update the latest blocks processed by each chain into the SQLite `state` table.
export function updateStateLatestBlocks(
  db: DatabaseType,
  state: State[]
): void {
  try {
    for (const { chainId, blockNumber, timestamp } of state) {
      db.prepare(
        "UPDATE state SET chain_id = ?1, block_number = ?2, timestamp = ?3 WHERE chain_id = ?1"
      ).run({ 1: chainId, 2: blockNumber, 3: timestamp });
    }
  } catch (err: any) {
    console.error("error in updateStateLatestBlocks:", err.message);
  }
}

// Get the latest blocks processed by each chain from the SQLite `state` table.
export function getStateBlockNumbers(db: DatabaseType): State[] {
  const query = db.prepare(
    "SELECT chain_id as chainId, block_number AS blockNumber, timestamp FROM state GROUP BY chainId"
  );
  return query.all() as State[];
}
