import Database from "better-sqlite3";
import { Events, Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getTblLatestBlocksByChain, getTblNewSqlLogs } from "./tbl";
import { getStateMaxBlockNumbers, insertStateLatestBlocks } from "./db";
import { buildDiscordEmbeds, sendEventsToWebhook } from "./discord";
import { findStateDiff, getBlockRangeForSqlLogs } from "./utils";
dotenv.config();

// Set up Discord client and ensure env vars are set up
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const { DISCORD_WEBHOOK_ID, DISCORD_WEBHOOK_TOKEN, DISCORD_BOT_TOKEN } =
  process.env;
if (
  DISCORD_WEBHOOK_ID == null ||
  DISCORD_WEBHOOK_TOKEN == null ||
  DISCORD_BOT_TOKEN == null
) {
  throw new Error(
    "DISCORD_WEBHOOK_ID, DISCORD_WEBHOOK_TOKEN, or DISCORD_BOT_TOKEN is not defined"
  );
}

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
    if (sqlLogs.length === 0) return;

    // Fetch the Discord webhook and send the SQL logs as embeds
    const webhook = await client.fetchWebhook(
      DISCORD_WEBHOOK_ID,
      DISCORD_WEBHOOK_TOKEN
    );
    if (webhook == null) {
      throw new Error("No webhook found");
    }
    const embeds = buildDiscordEmbeds(sqlLogs);
    await sendEventsToWebhook(webhook, embeds);
  } catch (err) {
    console.error("Error executing app: ", err);
  }
});

// Login to Discord and destroy the client after running the app
await client.login(DISCORD_BOT_TOKEN);
await client.destroy();
