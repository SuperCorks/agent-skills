#!/usr/bin/env node
/**
 * Compare services between two Boulevard environments
 * 
 * Usage:
 *   node scripts/diff-services.js \
 *     --source-env=prod \
 *     --source-business-id=PROD_BUSINESS_ID \
 *     --source-api-key=PROD_API_KEY \
 *     --source-api-secret=PROD_API_SECRET \
 *     --target-env=sandbox \
 *     --target-business-id=SANDBOX_BUSINESS_ID \
 *     --target-api-key=SANDBOX_API_KEY \
 *     --target-api-secret=SANDBOX_API_SECRET
 */

const { parseArgs, validateRequired } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken, stripBlvdId } = require('../lib/auth');
const { fetchAllPages } = require('../lib/pagination');

const LIST_CATEGORIES_QUERY = `
  query ListServiceCategories($first: Int!, $after: String) {
    serviceCategories(first: $first, after: $after) {
      edges {
        node {
          id
          name
          active
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const LIST_SERVICES_QUERY = `
  query ListServices($first: Int!, $after: String) {
    services(first: $first, after: $after) {
      edges {
        node {
          id
          active
          addon
          name
          description
          externalId
          categoryId
          category {
            id
            name
          }
          defaultDuration
          defaultPrice
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/**
 * Normalize a name for comparison (lowercase, trim, collapse whitespace)
 */
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Create a matching key for a service
 * Uses externalId if present, otherwise name + categoryName
 */
function getServiceMatchKey(service) {
  if (service.externalId) {
    return `externalId:${service.externalId}`;
  }
  const categoryName = normalizeName(service.category?.name || '');
  const serviceName = normalizeName(service.name);
  return `name:${categoryName}/${serviceName}`;
}

/**
 * Create a matching key for a category (just normalized name)
 */
function getCategoryMatchKey(category) {
  return normalizeName(category.name);
}

async function fetchEnvironmentData(env, businessId, apiKey, apiSecret, verbose) {
  const url = getAdminUrl(env);
  const token = generateAdminToken(businessId, apiKey, apiSecret);
  
  if (verbose) {
    console.error(`[Diff] Fetching data from ${env}...`);
  }
  
  const [categories, services] = await Promise.all([
    fetchAllPages({
      url,
      authToken: token,
      queryTemplate: LIST_CATEGORIES_QUERY,
      connectionPath: 'serviceCategories',
      options: { verbose },
    }),
    fetchAllPages({
      url,
      authToken: token,
      queryTemplate: LIST_SERVICES_QUERY,
      connectionPath: 'services',
      options: { verbose },
    }),
  ]);
  
  if (verbose) {
    console.error(`[Diff] ${env}: ${categories.length} categories, ${services.length} services`);
  }
  
  return { categories, services };
}

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
Usage: node scripts/diff-services.js [options]

Compare services and categories between two Boulevard environments

Required (Source):
  --source-env           Source environment: 'sandbox' or 'prod'
  --source-business-id   Source Boulevard Business ID
  --source-api-key       Source API application key
  --source-api-secret    Source API application secret

Required (Target):
  --target-env           Target environment: 'sandbox' or 'prod'
  --target-business-id   Target Boulevard Business ID
  --target-api-key       Target API application key
  --target-api-secret    Target API application secret

Optional:
  --verbose       Show progress
  --help          Show this help message

Matching Rules:
  - Categories: matched by normalized name
  - Services: matched by externalId if present, otherwise by name + categoryName

Output:
  JSON object with:
    - missingCategories: categories in source but not target
    - missingServices: services in source but not target
    - externalIdMismatches: services where target is missing externalId
    - summary: counts of each category
`);
    process.exit(0);
  }
  
  const requiredArgs = [
    'source-env', 'source-business-id', 'source-api-key', 'source-api-secret',
    'target-env', 'target-business-id', 'target-api-key', 'target-api-secret',
  ];
  
  try {
    validateRequired(args, requiredArgs);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error('Run with --help for usage information');
    process.exit(1);
  }
  
  const verbose = args.verbose === true || args.verbose === 'true';
  
  // Fetch data from both environments
  const [sourceData, targetData] = await Promise.all([
    fetchEnvironmentData(
      args['source-env'],
      args['source-business-id'],
      args['source-api-key'],
      args['source-api-secret'],
      verbose
    ),
    fetchEnvironmentData(
      args['target-env'],
      args['target-business-id'],
      args['target-api-key'],
      args['target-api-secret'],
      verbose
    ),
  ]);
  
  // Build lookup maps for target
  const targetCategoryMap = new Map();
  for (const cat of targetData.categories) {
    targetCategoryMap.set(getCategoryMatchKey(cat), cat);
  }
  
  const targetServiceMap = new Map();
  const targetServiceByNameMap = new Map(); // For externalId mismatch detection
  for (const svc of targetData.services) {
    targetServiceMap.set(getServiceMatchKey(svc), svc);
    const nameKey = `${normalizeName(svc.category?.name || '')}/${normalizeName(svc.name)}`;
    targetServiceByNameMap.set(nameKey, svc);
  }
  
  // Find differences
  const missingCategories = [];
  const missingServices = [];
  const externalIdMismatches = [];
  
  // Check categories
  for (const sourceCat of sourceData.categories) {
    const key = getCategoryMatchKey(sourceCat);
    if (!targetCategoryMap.has(key)) {
      missingCategories.push({
        name: sourceCat.name,
        sourceId: sourceCat.id,
        active: sourceCat.active,
      });
    }
  }
  
  // Check services
  for (const sourceSvc of sourceData.services) {
    const key = getServiceMatchKey(sourceSvc);
    const targetSvc = targetServiceMap.get(key);
    
    if (!targetSvc) {
      // Service not found by primary key, check if it exists by name
      const nameKey = `${normalizeName(sourceSvc.category?.name || '')}/${normalizeName(sourceSvc.name)}`;
      const targetByName = targetServiceByNameMap.get(nameKey);
      
      if (targetByName && sourceSvc.externalId && !targetByName.externalId) {
        // Service exists but is missing externalId
        externalIdMismatches.push({
          name: sourceSvc.name,
          categoryName: sourceSvc.category?.name,
          sourceId: sourceSvc.id,
          sourceExternalId: sourceSvc.externalId,
          targetId: targetByName.id,
          targetExternalId: targetByName.externalId,
        });
      } else if (!targetByName) {
        // Truly missing service
        missingServices.push({
          name: sourceSvc.name,
          description: sourceSvc.description,
          categoryName: sourceSvc.category?.name,
          sourceId: sourceSvc.id,
          externalId: sourceSvc.externalId,
          addon: sourceSvc.addon,
          active: sourceSvc.active,
          defaultDuration: sourceSvc.defaultDuration,
          defaultPrice: sourceSvc.defaultPrice,
        });
      }
    }
  }
  
  // Sort results
  missingCategories.sort((a, b) => a.name.localeCompare(b.name));
  missingServices.sort((a, b) => {
    const catCompare = (a.categoryName || '').localeCompare(b.categoryName || '');
    if (catCompare !== 0) return catCompare;
    return a.name.localeCompare(b.name);
  });
  externalIdMismatches.sort((a, b) => a.name.localeCompare(b.name));
  
  const result = {
    summary: {
      sourceCategories: sourceData.categories.length,
      sourceServices: sourceData.services.length,
      targetCategories: targetData.categories.length,
      targetServices: targetData.services.length,
      missingCategories: missingCategories.length,
      missingServices: missingServices.length,
      externalIdMismatches: externalIdMismatches.length,
    },
    missingCategories,
    missingServices,
    externalIdMismatches,
  };
  
  console.log(JSON.stringify(result, null, 2));
  
  // Exit with code 1 if there are differences
  if (missingCategories.length > 0 || missingServices.length > 0 || externalIdMismatches.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
