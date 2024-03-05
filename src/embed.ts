import { format } from "sql-formatter";
import { helpers } from "@tableland/sdk";
import {
  type Webhook,
  EmbedBuilder,
  bold,
  codeBlock,
  hyperlink,
} from "discord.js";
import type { SqlLogsData } from "./utils.js";
import { truncate } from "./utils.js";

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
        value: helpers.getChainInfo(log.chainId).chainName,
        inline: true,
      },
      {
        name: "Table ID",
        value: hyperlink(
          String(log.tableId),
          `${log.baseUrl}/tables/${log.chainId}/${log.tableId}`
        ),
        inline: true,
      },
      {
        name: "Table Name",
        value: log.tableName !== undefined ? String(log.tableName) : "N/A",
        inline: true,
      },
      {
        name: "Block",
        value: String(log.blockNumber),
        inline: true,
      },
      {
        name: "Transaction",
        value: hyperlink(
          log.txHash,
          `${log.baseUrl}/receipt/${log.chainId}/${log.txHash}`
        ),
        inline: true,
      },
      {
        name: bold("Caller"),
        value: log.caller ?? "N/A",
        inline: true,
      },
      {
        name: `Statement (${log.eventType === "ContractCreateTable" ? "table creation" : "mutating query"})`,
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
            value: `${bold("Inspect table data on the Studio:")} ${hyperlink(
              "here",
              `https://studio.tableland.xyz/table/${log.tableName}`
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
