import Database from "better-sqlite3";
import { Client, Events, GatewayIntentBits } from "discord.js";
import { getStateMaxBlockNumbers, insertStateLatestBlocks } from "./db.js";
import { buildDiscordEmbeds, sendEventsToWebhook } from "./embed.js";
import { getTblLatestBlocksByChain, getTblNewSqlLogs } from "./tbl.js";
import { findStateDiff, getBlockRangeForSqlLogs, getEnvVars } from "./utils.js";

// Set up Discord client and ensure env vars are set up
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const {
  DISCORD_WEBHOOK_ID_INTERNAL, // Only post internal core Tableland logs
  DISCORD_WEBHOOK_TOKEN_INTERNAL,
  DISCORD_WEBHOOK_ID_EXTERNAL, // Post logs from community devs
  DISCORD_WEBHOOK_TOKEN_EXTERNAL,
  DISCORD_BOT_TOKEN,
} = getEnvVars();

// Create a connection to the local SQLite database that stores the latest run
// information and the latest blocks processed by each chain.
const db = new Database("data/state.db", { verbose: console.log });

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
    // Exit if no logs (e.g., only found healthbot updates, but discarded)
    if (sqlLogs.internal.length === 0 || sqlLogs.external.length === 0) return;

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
      throw new Error("No webhook found");
    }
    const internalEmbeds = buildDiscordEmbeds(sqlLogs.internal);
    const externalEmbeds = buildDiscordEmbeds(sqlLogs.external);
    await sendEventsToWebhook(webhookInternal, internalEmbeds);
    await sendEventsToWebhook(webhookExternal, externalEmbeds);
  } catch (err) {
    console.error("Error executing app: ", err);
  }
});

// Login to Discord and destroy the client after running the app
await client.login(DISCORD_BOT_TOKEN);
await client.destroy();
