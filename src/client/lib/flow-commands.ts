import type { CommandInfo } from "../../shared/types.js";

/** pi-flows management commands that should not appear as launchable flows */
const EXCLUDED_FLOW_COMMANDS = new Set([
  "flows",
  "flows:new",
  "flows:edit",
  "flows:delete",
  "provider",
  "roles",
  "catalog",
]);

/** Filter commands list to find launchable flow commands */
export function getFlowCommands(commands: CommandInfo[]): CommandInfo[] {
  return commands.filter(
    (cmd) => cmd.source === "extension" && !EXCLUDED_FLOW_COMMANDS.has(cmd.name),
  );
}
