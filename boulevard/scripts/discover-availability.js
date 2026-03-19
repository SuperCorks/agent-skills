#!/usr/bin/env node

const {
  createClientContext,
  discoverAvailability,
  summarizeAvailability,
} = require("../lib/booking");
const { parseArgs, validateRequired } = require("../lib/cli");
const {
  getBooleanArg,
  getIntegerArg,
  getStringArg,
  resolveSingleEnvArgs,
} = require("../lib/config");
const { buildDefaultOutputPath, writeJsonFile } = require("../lib/output");

async function main() {
  const args = resolveSingleEnvArgs(parseArgs());

  if (args.help) {
    console.log(`
Usage: node scripts/discover-availability.js [options]

Discover bookable Boulevard times for a specific local date.

Required:
  --env             Environment: 'sandbox' or 'prod'
  --business-id     Boulevard Business ID (UUID)
  --api-key         API application key
  --location        Location name filter (substring match)
  --date            Local date in YYYY-MM-DD format

Optional:
  --env-file        Load BLVD_* and NEXT_PUBLIC_BLVD_ENV defaults from an env file
  --location-exact  Match the location name exactly (case-insensitive)
  --service         Service name filter (substring match)
  --service-exact   Match the service name exactly (case-insensitive)
  --zero-dollar-only  Show only free bookable items
  --delay-ms        Delay between per-item time lookups (default: 100)
  --output          Write the JSON payload to a specific file
  --verbose         Show additional GraphQL debug info
  --help            Show this help message
`);
    process.exit(0);
  }

  try {
    validateRequired(args, ["env", "business-id", "api-key", "location", "date"]);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error("Run with --help for usage information");
    process.exit(1);
  }

  const clientContext = createClientContext({
    env: args.env,
    businessId: args["business-id"],
    apiKey: args["api-key"],
  });

  const options = {
    date: getStringArg(args, "date"),
    locationName: getStringArg(args, "location"),
    locationExact: getBooleanArg(args, "location-exact"),
    serviceName: getStringArg(args, "service"),
    serviceExact: getBooleanArg(args, "service-exact"),
    zeroDollarOnly: getBooleanArg(args, "zero-dollar-only"),
    delayMs: getIntegerArg(args, "delay-ms", { defaultValue: 100, min: 0 }),
    verbose: getBooleanArg(args, "verbose"),
    progress(event) {
      if (event.stage === "discover-location") {
        console.error(
          `[discover] ${event.locationName}: checking ${event.itemCount} matching bookable items for ${options.date}`,
        );
      }
      if (event.stage === "discover-match") {
        console.error(
          `[discover] match ${event.locationName} | ${event.itemName} | ${event.slotCount} slots on ${options.date}`,
        );
      }
    },
  };

  const discoveryResult = await discoverAvailability(clientContext, options);
  const summary = summarizeAvailability(discoveryResult);
  const outputPath =
    getStringArg(args, "output") ||
    buildDefaultOutputPath("blvd-discover-availability", [options.date, options.locationName, options.serviceName || "all"]);

  const payload = {
    env: clientContext.env,
    locationFilter: options.locationName,
    serviceFilter: options.serviceName || null,
    zeroDollarOnly: options.zeroDollarOnly,
    date: options.date,
    outputPath,
    ...summary,
    availability: discoveryResult.availability,
  };

  writeJsonFile(outputPath, payload);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
