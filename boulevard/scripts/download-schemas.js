#!/usr/bin/env node
/**
 * Download Boulevard GraphQL schemas (Admin + Client APIs) via introspection.
 *
 * Usage:
 *   node scripts/download-schemas.js \
 *     --env=prod \
 *     --business-id=YOUR_BUSINESS_ID \
 *     --api-key=YOUR_API_KEY \
 *     --api-secret=YOUR_API_SECRET
 *
 * Outputs:
 *   schemas/admin-schema.graphql
 *   schemas/client-schema.graphql
 */

const fs = require("fs");
const path = require("path");
const { parseArgs, validateRequired } = require("../lib/cli");
const { getAdminUrl, getClientUrl } = require("../lib/endpoints");
const {
  generateAdminToken,
  generateGuestClientToken,
} = require("../lib/auth");
const { executeGraphQL, hasErrors, formatErrors } = require("../lib/graphql");

// Standard introspection query
const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        ...FullType
      }
      directives {
        name
        description
        locations
        args { ...InputValue }
      }
    }
  }

  fragment FullType on __Type {
    kind
    name
    description
    fields(includeDeprecated: true) {
      name
      description
      args { ...InputValue }
      type { ...TypeRef }
      isDeprecated
      deprecationReason
    }
    inputFields { ...InputValue }
    interfaces { ...TypeRef }
    enumValues(includeDeprecated: true) {
      name
      description
      isDeprecated
      deprecationReason
    }
    possibleTypes { ...TypeRef }
  }

  fragment InputValue on __InputValue {
    name
    description
    type { ...TypeRef }
    defaultValue
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// SDL generation from introspection JSON
// ---------------------------------------------------------------------------

function buildSDL(schema) {
  const types = schema.types || [];
  const builtinNames = new Set([
    "__Schema",
    "__Type",
    "__Field",
    "__InputValue",
    "__EnumValue",
    "__Directive",
    "__DirectiveLocation",
    "String",
    "Int",
    "Float",
    "Boolean",
    "ID",
  ]);

  const userTypes = types
    .filter((t) => !builtinNames.has(t.name) && !t.name.startsWith("__"))
    .sort((a, b) => {
      const order = { ENUM: 0, SCALAR: 1, INTERFACE: 2, OBJECT: 3, UNION: 4, INPUT_OBJECT: 5 };
      const diff = (order[a.kind] ?? 9) - (order[b.kind] ?? 9);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });

  const lines = [];

  // Schema definition (only if non-default names)
  const qt = schema.queryType?.name;
  const mt = schema.mutationType?.name;
  const st = schema.subscriptionType?.name;
  if ((qt && qt !== "Query") || (mt && mt !== "Mutation") || (st && st !== "Subscription")) {
    lines.push("schema {");
    if (qt) lines.push(`  query: ${qt}`);
    if (mt) lines.push(`  mutation: ${mt}`);
    if (st) lines.push(`  subscription: ${st}`);
    lines.push("}\n");
  }

  for (const t of userTypes) {
    const desc = t.description ? formatDescription(t.description, "") + "\n" : "";
    switch (t.kind) {
      case "SCALAR":
        lines.push(`${desc}scalar ${t.name}\n`);
        break;
      case "ENUM":
        lines.push(`${desc}enum ${t.name} {`);
        for (const v of t.enumValues || []) {
          if (v.description) lines.push(formatDescription(v.description, "  "));
          lines.push(`  ${v.name}${v.isDeprecated ? ` @deprecated(reason: ${JSON.stringify(v.deprecationReason || "")})` : ""}`);
        }
        lines.push("}\n");
        break;
      case "INTERFACE":
      case "OBJECT": {
        const keyword = t.kind === "INTERFACE" ? "interface" : "type";
        const ifaces =
          t.interfaces && t.interfaces.length
            ? ` implements ${t.interfaces.map((i) => typeRefStr(i)).join(" & ")}`
            : "";
        lines.push(`${desc}${keyword} ${t.name}${ifaces} {`);
        for (const f of t.fields || []) {
          if (f.description) lines.push(formatDescription(f.description, "  "));
          const args = f.args && f.args.length ? `(${f.args.map(inputValueStr).join(", ")})` : "";
          const dep = f.isDeprecated
            ? ` @deprecated(reason: ${JSON.stringify(f.deprecationReason || "")})`
            : "";
          lines.push(`  ${f.name}${args}: ${typeRefStr(f.type)}${dep}`);
        }
        lines.push("}\n");
        break;
      }
      case "UNION":
        lines.push(
          `${desc}union ${t.name} = ${(t.possibleTypes || []).map((p) => typeRefStr(p)).join(" | ")}\n`
        );
        break;
      case "INPUT_OBJECT":
        lines.push(`${desc}input ${t.name} {`);
        for (const f of t.inputFields || []) {
          if (f.description) lines.push(formatDescription(f.description, "  "));
          const def = f.defaultValue != null ? ` = ${f.defaultValue}` : "";
          lines.push(`  ${f.name}: ${typeRefStr(f.type)}${def}`);
        }
        lines.push("}\n");
        break;
    }
  }

  return lines.join("\n") + "\n";
}

function typeRefStr(t) {
  if (!t) return "UNKNOWN";
  if (t.kind === "NON_NULL") return `${typeRefStr(t.ofType)}!`;
  if (t.kind === "LIST") return `[${typeRefStr(t.ofType)}]`;
  return t.name || "UNKNOWN";
}

function inputValueStr(iv) {
  const def = iv.defaultValue != null ? ` = ${iv.defaultValue}` : "";
  return `${iv.name}: ${typeRefStr(iv.type)}${def}`;
}

function formatDescription(desc, indent) {
  if (!desc) return "";
  const escaped = desc.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  if (!desc.includes("\n") && desc.length < 80) {
    return `${indent}"${escaped}"`;
  }
  const lines = desc.split("\n");
  return `${indent}"""\n${lines.map((l) => `${indent}${l}`).join("\n")}\n${indent}"""`;
}

// ---------------------------------------------------------------------------

async function downloadSchema(label, url, token) {
  console.error(`[${label}] Fetching schema from ${url} ...`);
  const response = await executeGraphQL(url, token, INTROSPECTION_QUERY, {});

  if (hasErrors(response)) {
    console.error(`[${label}] GraphQL errors:\n${formatErrors(response.errors)}`);
    throw new Error(`Introspection failed for ${label}`);
  }

  const schema = response.data?.__schema;
  if (!schema) throw new Error(`No __schema in ${label} response`);

  const typesCount = (schema.types || []).filter(
    (t) => !t.name.startsWith("__")
  ).length;
  console.error(`[${label}] Got ${typesCount} types`);

  return schema;
}

async function main() {
  const args = parseArgs();

  try {
    validateRequired(args, ["env", "business-id", "api-key", "api-secret"]);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error(
      "\nUsage: node scripts/download-schemas.js --env=prod --business-id=X --api-key=Y --api-secret=Z"
    );
    process.exit(1);
  }

  const env = args.env;
  const businessId = args["business-id"];
  const apiKey = args["api-key"];
  const apiSecret = args["api-secret"];

  const schemasDir = path.join(__dirname, "..", "schemas");
  fs.mkdirSync(schemasDir, { recursive: true });

  // --- Admin API ---
  const adminUrl = getAdminUrl(env);
  const adminToken = generateAdminToken(businessId, apiKey, apiSecret);
  const adminSchema = await downloadSchema("Admin API", adminUrl, adminToken);
  const adminSDL = buildSDL(adminSchema);
  const adminPath = path.join(schemasDir, "admin-schema.graphql");
  fs.writeFileSync(adminPath, adminSDL);
  console.error(`[Admin API] Written to ${path.relative(process.cwd(), adminPath)}`);

  // Also save the raw JSON for tooling
  const adminJsonPath = path.join(schemasDir, "admin-schema.json");
  fs.writeFileSync(adminJsonPath, JSON.stringify({ __schema: adminSchema }, null, 2));
  console.error(`[Admin API] JSON written to ${path.relative(process.cwd(), adminJsonPath)}`);

  // --- Client API (Public/Guest) ---
  const clientUrl = getClientUrl(env, businessId);
  const clientToken = generateGuestClientToken(apiKey);
  const clientSchema = await downloadSchema("Client API", clientUrl, clientToken);
  const clientSDL = buildSDL(clientSchema);
  const clientPath = path.join(schemasDir, "client-schema.graphql");
  fs.writeFileSync(clientPath, clientSDL);
  console.error(`[Client API] Written to ${path.relative(process.cwd(), clientPath)}`);

  const clientJsonPath = path.join(schemasDir, "client-schema.json");
  fs.writeFileSync(clientJsonPath, JSON.stringify({ __schema: clientSchema }, null, 2));
  console.error(`[Client API] JSON written to ${path.relative(process.cwd(), clientJsonPath)}`);

  console.log("\n✅ Schemas downloaded successfully:");
  console.log(`   ${adminPath}`);
  console.log(`   ${clientPath}`);
}

main().catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
