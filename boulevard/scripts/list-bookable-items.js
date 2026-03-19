#!/usr/bin/env node

const { parseArgs, validateRequired } = require("../lib/cli");
const {
  createClientContext,
  listBookableItems,
} = require("../lib/booking");
const {
  getBooleanArg,
  getStringArg,
  resolveSingleEnvArgs,
} = require("../lib/config");
const { buildDefaultOutputPath, writeJsonFile } = require("../lib/output");

async function main() {
  const args = resolveSingleEnvArgs(parseArgs());

  if (args.help) {
    console.log(`
Usage: node scripts/list-bookable-items.js [options]

List currently enabled Boulevard bookable items for one or more locations.

Required:
  --env             Environment: 'sandbox' or 'prod'
  --business-id     Boulevard Business ID (UUID)
  --api-key         API application key
  --location        Location name filter (substring match)

Optional:
  --env-file        Load BLVD_* and NEXT_PUBLIC_BLVD_ENV defaults from an env file
  --location-exact  Match the location name exactly (case-insensitive)
  --service         Service name filter (substring match)
  --service-exact   Match the service name exactly (case-insensitive)
  --zero-dollar-only  Show only free bookable items
  --output          Write the JSON payload to a specific file
  --verbose         Show progress logs
  --help            Show this help message
`);
    process.exit(0);
  }

  try {
    validateRequired(args, ["env", "business-id", "api-key", "location"]);
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

  const verbose = getBooleanArg(args, "verbose");
  const options = {
    locationName: getStringArg(args, "location"),
    locationExact: getBooleanArg(args, "location-exact"),
    serviceName: getStringArg(args, "service"),
    serviceExact: getBooleanArg(args, "service-exact"),
    zeroDollarOnly: getBooleanArg(args, "zero-dollar-only"),
    verbose,
    progress(event) {
      if (event.stage === "items") {
        console.error(`[items] ${event.locationName}: ${event.itemCount} matching bookable items`);
      }
    },
  };

  const items = await listBookableItems(clientContext, options);
  items.sort((left, right) => {
    const locationCompare = left.locationName.localeCompare(right.locationName);
    if (locationCompare !== 0) {
      return locationCompare;
    }
    const categoryCompare = left.categoryName.localeCompare(right.categoryName);
    if (categoryCompare !== 0) {
      return categoryCompare;
    }
    return left.itemName.localeCompare(right.itemName);
  });

  const outputPath =
    getStringArg(args, "output") ||
    buildDefaultOutputPath("blvd-bookable-items", [options.locationName, options.serviceName || "all"]);

  const payload = {
    env: clientContext.env,
    locationFilter: options.locationName,
    serviceFilter: options.serviceName || null,
    zeroDollarOnly: options.zeroDollarOnly,
    itemCount: items.length,
    items,
    outputPath,
  };

  writeJsonFile(outputPath, payload);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
