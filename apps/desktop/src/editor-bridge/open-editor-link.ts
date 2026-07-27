import { commands as openerCommands } from "@meeki/plugin-opener2";

export async function openEditorLink(href: string) {
  await openerCommands.openUrl(href, null);
}
