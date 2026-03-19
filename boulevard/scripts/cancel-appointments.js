#!/usr/bin/env node

const {
  cancelAppointments,
  createAdminContext,
  createClientContext,
  listAppointmentsForDate,
  resolveLocations,
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
Usage: node scripts/cancel-appointments.js [options]

Find and cancel Boulevard appointments for a local date.

Safety:
  This script defaults to dry-run mode. Pass --confirm to perform real cancellations.

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
  --service         Filter appointments by service name (substring match)
  --service-exact   Match the service name exactly (case-insensitive)
  --client-email-prefix  Filter appointments by client email prefix
  --reason          Cancellation reason enum (default: MISTAKE)
  --notes           Cancellation notes
  --notify-client   Notify the client when cancelling
  --limit           Cancel only the first N matching appointments
  --delay-ms        Delay between cancellations (default: 150)
  --confirm         Perform real cancellations instead of a dry-run
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
    clientEmailPrefix: getStringArg(args, "client-email-prefix"),
    verbose: getBooleanArg(args, "verbose"),
  };

  const locations = await resolveLocations(clientContext, sharedOptions);
  if (locations.length !== 1) {
    throw new Error(
      `Cancellation requires exactly one matched location; found ${locations.length}. Use --location-exact to narrow it down.`,
    );
  }

  const appointments = await listAppointmentsForDate(adminContext, locations[0], sharedOptions);
  const limitedAppointments = (() => {
    const limit = getIntegerArg(args, "limit", { defaultValue: undefined, min: 1 });
    return limit ? appointments.slice(0, limit) : appointments;
  })();

  console.error(
    `[preflight] ${limitedAppointments.length} matching appointments at ${locations[0].name} on ${sharedOptions.date}`,
  );

  const attempts = await cancelAppointments(adminContext, limitedAppointments, {
    ...sharedOptions,
    dryRun: !getBooleanArg(args, "confirm"),
    reason: getStringArg(args, "reason", "MISTAKE"),
    notes: getStringArg(args, "notes", "Cancelled by Codex Boulevard cleanup script."),
    notifyClient: getBooleanArg(args, "notify-client"),
    delayMs: getIntegerArg(args, "delay-ms", { defaultValue: 150, min: 0 }),
    progress(event) {
      if (event.stage === "cancel-attempt") {
        console.error(`[cancel] ${event.appointmentId} | ${event.itemName} | ${event.startTime}`);
      }
    },
  });

  const cancelledCount = attempts.filter((attempt) => attempt.status === "cancelled").length;
  const failedCount = attempts.filter((attempt) => attempt.status === "failed").length;
  const dryRunCount = attempts.filter((attempt) => attempt.status === "dry-run").length;
  const outputPath =
    getStringArg(args, "output") ||
    buildDefaultOutputPath("blvd-cancel-appointments", [
      sharedOptions.date,
      sharedOptions.locationName,
      sharedOptions.serviceName || sharedOptions.clientEmailPrefix || "all",
    ]);

  const payload = {
    env: adminContext.env,
    date: sharedOptions.date,
    locationFilter: sharedOptions.locationName,
    serviceFilter: sharedOptions.serviceName || null,
    clientEmailPrefix: sharedOptions.clientEmailPrefix || null,
    reason: getStringArg(args, "reason", "MISTAKE"),
    dryRun: !getBooleanArg(args, "confirm"),
    appointmentCount: limitedAppointments.length,
    cancelledCount,
    failedCount,
    dryRunCount,
    outputPath,
    appointments: limitedAppointments,
    attempts,
  };

  writeJsonFile(outputPath, payload);
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
