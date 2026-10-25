#!/usr/bin/env node
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import {
  accountsFromEnv,
  selectAccount,
  createClient,
  LinearError,
  fail,
} from "../lib/client.mjs";
import { commandOptions, commonOptions, execute } from "../lib/operations.mjs";

const booleans = new Set(["help", "all", "dry-run", "allow-duplicate", "post"]);
export function parse(argv) {
  const [command, ...rest] = argv;
  if (!command || command === "--help" || command === "help")
    return { help: true };
  if (!Object.hasOwn(commandOptions, command))
    fail("USAGE", "Unknown command. Run --help for supported commands.");
  const options = Object.fromEntries(
    [...commonOptions, ...commandOptions[command]].map((name) => [
      name,
      { type: booleans.has(name) ? "boolean" : "string" },
    ]),
  );
  try {
    const parsed = parseArgs({
      args: rest,
      options,
      allowPositionals: false,
      strict: true,
      tokens: true,
    });
    const names = parsed.tokens
      .filter((token) => token.kind === "option")
      .map((token) => token.name);
    if (new Set(names).size !== names.length)
      fail(
        "USAGE",
        "Do not repeat flags; use comma-separated values where supported.",
      );
    return { command, options: parsed.values };
  } catch {
    fail("USAGE", "Invalid, missing, or unknown option. Run COMMAND --help.");
  }
}

export async function run(
  argv,
  { env = process.env, fetchImpl = globalThis.fetch } = {},
) {
  const parsed = parse(argv);
  if (parsed.help || parsed.options?.help)
    return {
      usage: "node scripts/linear.mjs COMMAND [options]",
      commands: parsed.command
        ? { [parsed.command]: commandOptions[parsed.command] }
        : commandOptions,
      common: commonOptions,
      notes: [
        "Read SKILL.md and references/commands.md for examples and field meanings.",
        "Writes require --workspace UUID from verify; multiple accounts require --account ALIAS.",
        "comment previews by default; --post sends and requires explicit user authorization.",
        "No automatic retries. Pagination returns complete and pageInfo; --all is bounded at 100 pages.",
      ],
    };
  const accounts = accountsFromEnv(env);
  if (parsed.command === "accounts") return { accounts: Object.keys(accounts) };
  const account = selectAccount(accounts, parsed.options.account);
  const output = await execute(
    parsed.command,
    parsed.options,
    createClient(account.authorization, fetchImpl),
  );
  return {
    ...output,
    metadata: { account: account.alias, ...output.metadata },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      JSON.stringify(
        { ok: true, ...(await run(process.argv.slice(2))) },
        null,
        2,
      ),
    );
  } catch (error) {
    const known = error instanceof LinearError;
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: {
            code: known ? error.code : "UNEXPECTED_ERROR",
            message: known
              ? error.message
              : "Unexpected local failure. No input, credentials, or raw response were logged.",
            ...(known ? error.details : {}),
          },
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}
