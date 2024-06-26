import { existsSync, mkdirSync, rmSync } from "fs";
import { dirname } from "path";
import {
  checkVaultExists,
  createVault,
  downloadStateDbFromEvent,
  type Signer,
  getVaultEvents,
  getVaults,
} from "./basin.js";
import { initDb } from "./db.js";

// Initialize the state database with the private key and the path to the
// SQLite database that gets downloaded from the vault—or, if it's the first
// ever run, it'll create a fresh database and write it to the vault. Also, if a
// migration is set, it will skip fetching the latest state from the vault and
// create a new database with empty data (e.g., new chains added, so columns
// have to reflect the new data).
export async function init(
  signer: Signer,
  vault: string,
  dbPath: string,
  runMigration: boolean
): Promise<void> {
  // Check the `state` SQLite db & table and create if it does not exist
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir);
  }
  // Remove any old `state.db` file
  if (existsSync(dbPath)) {
    rmSync(dbPath);
  }

  // Check if the `vault` exists and create if it does not
  const address = signer.address();
  const vaults = await getVaults(address);
  const vaultExists = checkVaultExists(vaults, vault);
  if (!vaultExists) {
    // Create a new vault with 30 minute cache
    // Runs occur every 15 minutes, so leave some buffer
    await createVault(vault, address, 30);
  }

  // Get latest vault event
  const events = await getVaultEvents(vault, { latest: 1 });
  // If no events, then create a db / table to initialize vault state. Or, if
  // migration is set, then create a new db with empty data, which reflects new
  // chains that aren't part of the previous state.
  if (events.length === 0 || runMigration) {
    console.log(runMigration ? "migrating db" : "creating new db");
    initDb(dbPath);
  } else {
    // If events, or no migration, then fetch db from vault at latest event
    const event = events[0];
    const { cid } = event as { cid: string };
    // Get the latest state from the vault
    try {
      await downloadStateDbFromEvent(cid, dbPath);
    } catch {
      // TMP: if the download fails, then fallback to creating a db in order to
      // avoid errors...which happens when vault event cache expires and no data
      // is fetched from cold storage
      initDb(dbPath);
    }
  }
  if (!existsSync(dbPath)) {
    throw new Error("failed to download state from vault");
  }
}
