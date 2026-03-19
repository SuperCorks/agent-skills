#!/usr/bin/env node

const {
  bookAvailability,
  createAdminContext,
  createClientContext,
  discoverAvailability,
  summarizeAvailability,
  summarizeBookingAttempts,
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
  const args = resolveSingleEnvArgs(parseArgs(), { requireApiSecret: true });

  if (args.help) {
    console.log(`
Usage: node scripts/book-slots.js [options]

Discover and then attempt to book Boulevard slots for a local date.

Safety:
  This script defaults to dry-run mode. Pass --confirm to create real bookings.

Required:
  --env             Environment: 'sandbox' or 'prod'
  --business-id     Boulevard Business ID (UUID)
  --api-key         API application key
  --api-secret      API application secret (base64-encoded)
  --location        Location name filter (substring match)
  --date            Local date in YYYY-MM-DD format

Optional:
  --env-file        Load BLVD_* and NEXT_PUBLIC_BLVD_ENV defaults from an env file
  --location-exact  Match the location name exactly (case-insensitive)
  --service         Service name filter (substring match)
  --service-exact   Match the service name exactly (case-insensitive)
  --zero-dollar-only  Target only free bookable items
  --limit           Attempt only the first N discovered slots
  --delay-ms        Delay between booking attempts (default: 150)
  --confirm         Perform real bookings instead of a dry-run
  --client-first-name        First name for created clients (default: Codex)
  --client-last-name-prefix  Last-name prefix for created clients (default: Booking)
  --client-email-prefix      Email prefix for created clients (default: codex-blvd)
  --client-email-domain      Email domain for created clients (default: example.com)
  --client-phone             Phone number for created clients (default: 5555550101)
  --output          Write the JSON payload to a specific file
  --verbose         Show additional GraphQL debug info
  --help            Show this help message
`);
    process.exit(0);
  }

  try {
    validateRequired(args, ["env", "business-id", "api-key", "api-secret", "location", "date"]);
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
  const adminContext = createAdminContext({
    env: args.env,
    businessId: args["business-id"],
    apiKey: args["api-key"],
    apiSecret: args["api-secret"],
  });

  const sharedOptions = {
    date: getStringArg(args, "date"),
    locationName: getStringArg(args, "location"),
    locationExact: getBooleanArg(args, "location-exact"),
    serviceName: getStringArg(args, "service"),
    serviceExact: getBooleanArg(args, "service-exact"),
    zeroDollarOnly: getBooleanArg(args, "zero-dollar-only"),
    verbose: getBooleanArg(args, "verbose"),
  };

  const discoveryResult = await discoverAvailability(clientContext, {
    ...sharedOptions,
    delayMs: getIntegerArg(args, "delay-ms", { defaultValue: 100, min: 0 }),
    progress(event) {
      if (event.stage === "discover-location") {
        console.error(
          `[discover] ${event.locationName}: checking ${event.itemCount} matching bookable items for ${sharedOptions.date}`,
        );
      }
      if (event.stage === "discover-match") {
        console.error(
          `[discover] match ${event.locationName} | ${event.itemName} | ${event.slotCount} slots on ${sharedOptions.date}`,
        );
      }
    },
  });

  const discoverySummary = summarizeAvailability(discoveryResult);
  console.error(
    `[preflight] ${discoverySummary.bookableItemCount} matching items, ${discoverySummary.slotCount} candidate slots on ${sharedOptions.date}`,
  );

  const attempts = await bookAvailability(clientContext, adminContext, discoveryResult.availability, {
    ...sharedOptions,
    dryRun: !getBooleanArg(args, "confirm"),
    limit: getIntegerArg(args, "limit", { defaultValue: undefined, min: 1 }),
    delayMs: getIntegerArg(args, "delay-ms", { defaultValue: 150, min: 0 }),
    clientFirstName: getStringArg(args, "client-first-name"),
    clientLastNamePrefix: getStringArg(args, "client-last-name-prefix"),
    clientEmailPrefix: getStringArg(args, "client-email-prefix"),
    clientEmailDomain: getStringArg(args, "client-email-domain"),
    clientPhone: getStringArg(args, "client-phone"),
    progress(event) {
      if (event.stage === "book-attempt") {
        console.error(`[book] ${event.locationName} | ${event.itemName} | ${event.startTime}`);
      }
    },
  });

  const attemptSummary = summarizeBookingAttempts(attempts);
  const outputPath =
    getStringArg(args, "output") ||
    buildDefaultOutputPath("blvd-book-slots", [sharedOptions.date, sharedOptions.locationName, sharedOptions.serviceName || "all"]);

  const payload = {
    env: clientContext.env,
    date: sharedOptions.date,
    locationFilter: sharedOptions.locationName,
    serviceFilter: sharedOptions.serviceName || null,
    zeroDollarOnly: sharedOptions.zeroDollarOnly,
    dryRun: !getBooleanArg(args, "confirm"),
    outputPath,
    ...discoverySummary,
    ...attemptSummary,
    attempts,
  };

  writeJsonFile(outputPath, payload);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
