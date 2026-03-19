const fs = require("fs");
const path = require("path");

function parseEnvFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  const fileContents = fs.readFileSync(resolvedPath, "utf8");
  const values = {};

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return {
    path: resolvedPath,
    values,
  };
}

function normalizeEnvName(value) {
  if (!value) {
    return value;
  }

  if (value === "production") {
    return "prod";
  }

  return value;
}

function resolveSingleEnvArgs(args, options = {}) {
  const {
    requireApiSecret = false,
    includeClientId = false,
    envFileArgName = "env-file",
  } = options;

  let envFileData;
  if (args[envFileArgName]) {
    envFileData = parseEnvFile(args[envFileArgName]);
  }

  const fileValues = envFileData?.values ?? {};
  const resolvedArgs = {
    ...args,
    env: normalizeEnvName(args.env || fileValues.NEXT_PUBLIC_BLVD_ENV || process.env.NEXT_PUBLIC_BLVD_ENV),
    "business-id": args["business-id"] || fileValues.BLVD_BUSINESS_ID || process.env.BLVD_BUSINESS_ID,
    "api-key": args["api-key"] || fileValues.BLVD_API_KEY || process.env.BLVD_API_KEY,
  };

  if (requireApiSecret) {
    resolvedArgs["api-secret"] =
      args["api-secret"] || fileValues.BLVD_API_SECRET || process.env.BLVD_API_SECRET;
  }

  if (includeClientId) {
    resolvedArgs["client-id"] = args["client-id"] || fileValues.BLVD_CLIENT_ID || process.env.BLVD_CLIENT_ID;
  }

  if (envFileData) {
    resolvedArgs.__envFilePath = envFileData.path;
  }

  return resolvedArgs;
}

function getBooleanArg(args, key, defaultValue = false) {
  const value = args[key];
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function getStringArg(args, key, defaultValue = "") {
  const value = args[key];
  if (value === undefined || value === null) {
    return defaultValue;
  }

  return String(value);
}

function getIntegerArg(args, key, options = {}) {
  const { defaultValue, min, max } = options;
  const value = args[key];
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsedValue)) {
    throw new Error(`Invalid integer for --${key}: ${value}`);
  }
  if (min !== undefined && parsedValue < min) {
    throw new Error(`--${key} must be >= ${min}`);
  }
  if (max !== undefined && parsedValue > max) {
    throw new Error(`--${key} must be <= ${max}`);
  }

  return parsedValue;
}

function getRequiredStringArg(args, key) {
  const value = getStringArg(args, key);
  if (!value) {
    throw new Error(`Missing required argument: --${key}`);
  }
  return value;
}

module.exports = {
  getBooleanArg,
  getIntegerArg,
  getRequiredStringArg,
  getStringArg,
  normalizeEnvName,
  parseEnvFile,
  resolveSingleEnvArgs,
};
