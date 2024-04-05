import { join } from "path";
import Database from "better-sqlite3";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { writeFileToVault, Signer, bytesToHex } from "./basin.js";
import {
  getStateBlockNumbers,
  insertStateLatestBlocks,
  updateStateLatestBlocks,
} from "./db.js";
import { buildDiscordEmbeds, sendEventsToWebhook } from "./embed.js";
import { getTblLatestBlocksByChain, getTblNewSqlLogs } from "./tbl.js";
import {
  findStateDiff,
  getBasinConfig,
  getBlockRangeForSqlLogs,
  getEnvVars,
} from "./utils.js";
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
  NODE_ENV,
  RUN_MIGRATION,
} = getEnvVars();

const { vault } = getBasinConfig(NODE_ENV);

// Initialize the state database with the private key and the path to the
// SQLite database that gets downloaded from the vault
const signer = new Signer(PRIVATE_KEY);
const dbPath = join("data", "state.db");
const runMigration = RUN_MIGRATION === "true";
await init(signer, vault, dbPath, runMigration);

// Create a connection to the local SQLite database that stores the latest run
// information and the latest blocks processed by each chain.
const db = new Database(dbPath, { verbose: console.log });

// Run the app when the client is ready—only once
client.once(Events.ClientReady, async () => {
  try {
    // Get the previous state and the next state from the validator node
    const previousState = getStateBlockNumbers(db);
    // Get next state and find the difference w/ previous state
    const nextState = await getTblLatestBlocksByChain();
    const diff = findStateDiff(previousState, nextState);
    // If previous state exists, then update data, else insert it
    previousState.length !== 0
      ? updateStateLatestBlocks(db, diff)
      : insertStateLatestBlocks(db, diff);
    // TMP: always write the latest db state to the vault to avoid HTTP API 404s
    // where the cache is expired & the event is not retrieved from cold storage
    const signatureBytes = await signer.signFile(dbPath);
    const signature = bytesToHex(signatureBytes);
    await writeFileToVault(vault, dbPath, signature);

    // Get the block ranges for to get new SQL logs
    const blockRanges = getBlockRangeForSqlLogs(previousState, diff);
    const sqlLogs = await getTblNewSqlLogs(blockRanges);
    // Exit early if no logs (e.g., only found healthbot updates)—no need to
    // write the latest db state to the vault and send the logs to Discord
    if (sqlLogs.internal.length === 0 && sqlLogs.external.length === 0) return;

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
  } catch (err) {
    console.error("error executing app: ", err);
  }
});

// Login to Discord and destroy the client after running the app
await client.login(DISCORD_BOT_TOKEN);
await client.destroy();
