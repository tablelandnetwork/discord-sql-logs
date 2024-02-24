import { format } from "sql-formatter";
import {
  EmbedBuilder,
  bold,
  codeBlock,
  hyperlink,
  type Webhook,
} from "discord.js";
import type { SqlLogsData } from "./utils";
import { truncate } from "./utils";
import { helpers } from "@tableland/sdk";

// Build Discord embeds for each Tableland SQL log processed.
export function buildDiscordEmbeds(logs: SqlLogsData[]): EmbedBuilder[] {
  const embeds: EmbedBuilder[] = [];
  for (const log of logs) {
    // Format the SQL statement—only works with valid SQL syntax (no errors)
    const statement = codeBlock(
      truncate(
        log.error !== undefined
          ? log.statement
          : format(log.statement, { language: "sqlite" }),
        1013 // Account for code block backticks & `\n` (1024 bytes max)
      )
    );
    const embedFields = [
      {
        name: "Chain",
        value: helpers.getChainInfo(log.chain_id).chainName,
        inline: true,
      },
      {
        name: "Table ID",
        value: hyperlink(
          String(log.table_id),
          `${log.base_url}/tables/${log.chain_id}/${log.table_id}`
        ),
        inline: true,
      },
      {
        name: "Table Name",
        value: log.table_name !== undefined ? String(log.table_name) : "N/A",
        inline: true,
      },
      {
        name: "Block",
        value: String(log.block_number),
        inline: true,
      },
      {
        name: "Transaction",
        value: hyperlink(
          log.tx_hash,
          `${log.base_url}/receipt/${log.chain_id}/${log.tx_hash}`
        ),
        inline: true,
      },
      {
        name: bold("Caller"),
        value: log.caller !== undefined ? log.caller : "N/A",
        inline: true,
      },
      {
        name: `Statement (${log.event_type === "ContractCreateTable" ? "table creation" : "mutating query"})`,
        value: statement,
      },
      {
        name: "\u200b",
        value: " ",
      },
    ];
    const embedQueryLinkOrError =
      log.error !== undefined
        ? {
            name: "Error",
            value: codeBlock(log.error),
          }
        : {
            name: "\n",
            value: `${bold("Inspect table data:")} ${hyperlink(
              "here",
              `${log.base_url}/query?statement=select%20*%20from%20${log.table_name}%20limit%205`
            )}`,
          };
    embedFields.splice(embedFields.length - 1, 0, embedQueryLinkOrError);

    const embed = new EmbedBuilder()
      .setTitle("New SQL Logs")
      .setColor(0x815691)
      .setFields(embedFields)
      .setTimestamp(new Date())
      .setFooter({
        text: "❤️ SQL Logs Bot",
        iconURL:
          "https://bafkreihrg4iddyor2ei6mxxdy6hqnjsmquzcnllvoqndfb636i5s4yinma.ipfs.nftstorage.link/",
      });
    embeds.push(embed);
  }
  return embeds;
}

// Send one or more SQL logs to the Discord webhook.
export async function sendEventsToWebhook(
  webhook: Webhook,
  embeds: EmbedBuilder[]
): Promise<void> {
  for (const embed of embeds) {
    await webhook.send({
      username: "SQL Logs Bot",
      avatarURL:
        "https://bafybeiezqhnetm6iidwpkpcmaoczjvlldxauffs5566t5sungxqabgtm7q.ipfs.nftstorage.link/",
      embeds: [embed],
    });
  }
}
