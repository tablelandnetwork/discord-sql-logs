import { type Database } from "better-sqlite3";
import { type State } from "./utils";

export function insertStateLatestBlocks(db: Database, state: State[]): void {
  try {
    for (const { chain_id, block_number, timestamp } of state) {
      db.prepare(
        "INSERT OR IGNORE INTO state (chain_id, block_number, timestamp) VALUES (?, ?, ?)"
      ).run(chain_id, block_number, timestamp);
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

export function getStateMaxBlockNumbers(db: Database): State[] {
  const query = db.prepare(
    "SELECT chain_id, max(block_number) AS block_number, timestamp FROM state GROUP BY chain_id"
  );
  return query.all() as State[];
}
