import Database from "better-sqlite3";
import { Events, Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { getTblLatestBlocksByChain, getTblNewSqlLogs } from "./tbl";
import { getStateMaxBlockNumbers, insertStateLatestBlocks } from "./db";
import { buildDiscordEmbeds, sendEventsToWebhook } from "./discord";
import { findStateDiff, getBlockRangeForSqlLogs } from "./utils";
dotenv.config();

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

const db = new Database("data/state.db", { verbose: console.log });
client.once(Events.ClientReady, async () => {
  try {
    const previousState = getStateMaxBlockNumbers(db);
    const nextState = await getTblLatestBlocksByChain();
    const diff = findStateDiff(previousState, nextState);
    insertStateLatestBlocks(db, diff);

    const blockRanges = getBlockRangeForSqlLogs(previousState, diff);
    const sqlLogs = await getTblNewSqlLogs(blockRanges);
    // Exit if no logs (e.g., only found healthbot updates but discarded)
    if (sqlLogs.length === 0) return;

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

await client.login(DISCORD_BOT_TOKEN);
await client.destroy();
