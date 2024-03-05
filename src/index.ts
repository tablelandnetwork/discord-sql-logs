import { join } from "path";
import Database from "better-sqlite3";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { writeFileToVault, Signer, bytesToHex } from "./basin.js";
import { getStateMaxBlockNumbers, insertStateLatestBlocks } from "./db.js";
import { buildDiscordEmbeds, sendEventsToWebhook } from "./embed.js";
import { getTblLatestBlocksByChain, getTblNewSqlLogs } from "./tbl.js";
import { findStateDiff, getBlockRangeForSqlLogs, getEnvVars } from "./utils.js";
import { init } from "./init.js";

// Set up Discord client and ensure env vars are set up
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const {
  DISCORD_WEBHOOK_ID_INTERNAL, // Only post internal core Tableland logs
  DISCORD_WEBHOOK_TOKEN_INTERNAL,
  DISCORD_WEBHOOK_ID_EXTERNAL, // Post logs from community devs
  DISCORD_WEBHOOK_TOKEN_EXTERNAL,
  DISCORD_BOT_TOKEN,
  PRIVATE_KEY,
} = getEnvVars();

// Initialize the state database with the private key and the path to the
// SQLite database that gets downloaded from the vault
const signer = new Signer(PRIVATE_KEY);
const vault = "discord_bot_state.db";
const dbPath = join("data", "state.db");
await init(signer, vault, dbPath);

// Create a connection to the local SQLite database that stores the latest run
// information and the latest blocks processed by each chain.
const db = new Database(dbPath, { verbose: console.log });

// Run the app when the client is ready—only once
client.once(Events.ClientReady, async () => {
  try {
    // Get the previous state and the next state from the validator node
    const previousState = getStateMaxBlockNumbers(db);
    const nextState = await getTblLatestBlocksByChain();
    // Find the difference b/w the previous and next state & insert into db
    const diff = findStateDiff(previousState, nextState);
    insertStateLatestBlocks(db, diff);
    // Get the block ranges for SQL logs to be used in getting new SQL logs
    const blockRanges = getBlockRangeForSqlLogs(previousState, diff);
    const sqlLogs = await getTblNewSqlLogs(blockRanges);
    // Exit early if no logs (e.g., only found healthbot updates) or if
    if (sqlLogs.internal.length === 0 && sqlLogs.external.length === 0) {
      // If no previous state, then vault is empty—write the latest db state
      if (previousState.length === 0) {
        const signatureBytes = await signer.signFile(dbPath);
        const signature = bytesToHex(signatureBytes);
        await writeFileToVault(vault, dbPath, signature);
      }
      return; // Exit early
    }

    // Fetch the Discord webhooks and send the SQL logs as embeds, separating
    // internal logs from external logs on different webhooks
    const webhookInternal = await client.fetchWebhook(
      DISCORD_WEBHOOK_ID_INTERNAL,
      DISCORD_WEBHOOK_TOKEN_INTERNAL
    );
    const webhookExternal = await client.fetchWebhook(
      DISCORD_WEBHOOK_ID_EXTERNAL,
      DISCORD_WEBHOOK_TOKEN_EXTERNAL
    );
    if (webhookInternal == null || webhookExternal == null) {
      throw new Error("no webhook found");
    }
    const internalEmbeds = buildDiscordEmbeds(sqlLogs.internal);
    const externalEmbeds = buildDiscordEmbeds(sqlLogs.external);
    await sendEventsToWebhook(webhookInternal, internalEmbeds);
    await sendEventsToWebhook(webhookExternal, externalEmbeds);

    // Write the latest db state do the vault as an event
    const signatureBytes = await signer.signFile(dbPath);
    const signature = bytesToHex(signatureBytes);
    await writeFileToVault(vault, dbPath, signature);
  } catch (err) {
    console.error("error executing app: ", err);
  }
});

// Login to Discord and destroy the client after running the app
await client.login(DISCORD_BOT_TOKEN);
await client.destroy();
