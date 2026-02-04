#!/usr/bin/env node
/**
 * Sync services from source to target Boulevard environment (create-only)
 * 
 * Usage:
 *   node scripts/sync-services.js \
 *     --source-env=prod \
 *     --source-business-id=PROD_BUSINESS_ID \
 *     --source-api-key=PROD_API_KEY \
 *     --source-api-secret=PROD_API_SECRET \
 *     --target-env=sandbox \
 *     --target-business-id=SANDBOX_BUSINESS_ID \
 *     --target-api-key=SANDBOX_API_KEY \
 *     --target-api-secret=SANDBOX_API_SECRET \
 *     --dry-run
 */

const { parseArgs, validateRequired } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken, ensureBlvdId } = require('../lib/auth');
const { fetchAllPages } = require('../lib/pagination');
const { executeGraphQL, hasErrors, formatErrors, sleep } = require('../lib/graphql');

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
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const CREATE_CATEGORY_MUTATION = `
  mutation CreateServiceCategory($input: CreateServiceCategoryInput!) {
    createServiceCategory(input: $input) {
      serviceCategory {
        id
        name
      }
    }
  }
`;

const CREATE_SERVICE_MUTATION = `
  mutation CreateService($input: CreateServiceInput!) {
    createService(input: $input) {
      service {
        id
        name
      }
    }
  }
`;

const UPDATE_SERVICE_MUTATION = `
  mutation UpdateService($input: UpdateServiceInput!) {
    updateService(input: $input) {
      service {
        id
        name
        externalId
      }
    }
  }
`;

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getServiceMatchKey(service) {
  if (service.externalId) {
    return `externalId:${service.externalId}`;
  }
  const categoryName = normalizeName(service.category?.name || '');
  const serviceName = normalizeName(service.name);
  return `name:${categoryName}/${serviceName}`;
}

function getCategoryMatchKey(category) {
  return normalizeName(category.name);
}

async function fetchEnvironmentData(url, token, verbose) {
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
  
  return { categories, services };
}

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
Usage: node scripts/sync-services.js [options]

Sync services and categories from source to target Boulevard environment

Behavior:
  - CREATE-ONLY: Creates missing categories and services; never deletes
  - externalId backfill: If source has externalId but matching target doesn't, updates target
  - Matching: Uses externalId if present, otherwise name + categoryName

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
  --dry-run       Preview changes without making mutations
  --verbose       Show progress
  --help          Show this help message

Writable Fields (API Limitations):
  - ServiceCategory: name only
  - Service: name, description, categoryId, addon, externalId
  
Note: defaultDuration and defaultPrice are READ-ONLY and cannot be synced.
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
  const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
  
  const sourceUrl = getAdminUrl(args['source-env']);
  const sourceToken = generateAdminToken(
    args['source-business-id'],
    args['source-api-key'],
    args['source-api-secret']
  );
  
  const targetUrl = getAdminUrl(args['target-env']);
  const targetToken = generateAdminToken(
    args['target-business-id'],
    args['target-api-key'],
    args['target-api-secret']
  );
  
  if (dryRun) {
    console.error('[Sync] DRY RUN mode - no changes will be made');
  }
  
  // Fetch data from both environments
  console.error(`[Sync] Fetching data from ${args['source-env']}...`);
  const sourceData = await fetchEnvironmentData(sourceUrl, sourceToken, verbose);
  console.error(`[Sync] Source: ${sourceData.categories.length} categories, ${sourceData.services.length} services`);
  
  console.error(`[Sync] Fetching data from ${args['target-env']}...`);
  let targetData = await fetchEnvironmentData(targetUrl, targetToken, verbose);
  console.error(`[Sync] Target: ${targetData.categories.length} categories, ${targetData.services.length} services`);
  
  // Build target lookup maps
  const targetCategoryMap = new Map();
  for (const cat of targetData.categories) {
    targetCategoryMap.set(getCategoryMatchKey(cat), cat);
  }
  
  const targetServiceMap = new Map();
  const targetServiceByNameMap = new Map();
  for (const svc of targetData.services) {
    targetServiceMap.set(getServiceMatchKey(svc), svc);
    const nameKey = `${normalizeName(svc.category?.name || '')}/${normalizeName(svc.name)}`;
    targetServiceByNameMap.set(nameKey, svc);
  }
  
  const results = {
    categoriesCreated: [],
    servicesCreated: [],
    externalIdsUpdated: [],
    errors: [],
  };
  
  // Step 1: Create missing categories
  console.error('[Sync] Checking categories...');
  const categoriesToCreate = [];
  for (const sourceCat of sourceData.categories) {
    const key = getCategoryMatchKey(sourceCat);
    if (!targetCategoryMap.has(key)) {
      categoriesToCreate.push(sourceCat);
    }
  }
  
  if (categoriesToCreate.length > 0) {
    console.error(`[Sync] Creating ${categoriesToCreate.length} missing categories...`);
    
    for (const cat of categoriesToCreate) {
      if (dryRun) {
        console.error(`  [DRY RUN] Would create category: ${cat.name}`);
        results.categoriesCreated.push({ name: cat.name, dryRun: true });
        // Add to map for service creation
        targetCategoryMap.set(getCategoryMatchKey(cat), { id: 'dry-run-id', name: cat.name });
      } else {
        try {
          const response = await executeGraphQL(
            targetUrl,
            targetToken,
            CREATE_CATEGORY_MUTATION,
            { input: { name: cat.name } },
            { verbose }
          );
          
          if (hasErrors(response)) {
            const errMsg = formatErrors(response.errors);
            console.error(`  [ERROR] Failed to create category "${cat.name}": ${errMsg}`);
            results.errors.push({ type: 'createCategory', name: cat.name, error: errMsg });
          } else {
            const created = response.data?.createServiceCategory?.serviceCategory;
            console.error(`  [OK] Created category: ${cat.name} (${created?.id})`);
            results.categoriesCreated.push({ name: cat.name, id: created?.id });
            // Add to map for service creation
            targetCategoryMap.set(getCategoryMatchKey(cat), created);
          }
          
          // Small delay to avoid rate limits
          await sleep(100);
        } catch (err) {
          console.error(`  [ERROR] Failed to create category "${cat.name}": ${err.message}`);
          results.errors.push({ type: 'createCategory', name: cat.name, error: err.message });
        }
      }
    }
  } else {
    console.error('[Sync] All categories exist in target');
  }
  
  // Step 2: Create missing services and update externalIds
  console.error('[Sync] Checking services...');
  const servicesToCreate = [];
  const servicesToUpdateExternalId = [];
  
  for (const sourceSvc of sourceData.services) {
    const key = getServiceMatchKey(sourceSvc);
    const targetSvc = targetServiceMap.get(key);
    
    if (!targetSvc) {
      // Check if service exists by name (for externalId mismatch)
      const nameKey = `${normalizeName(sourceSvc.category?.name || '')}/${normalizeName(sourceSvc.name)}`;
      const targetByName = targetServiceByNameMap.get(nameKey);
      
      if (targetByName && sourceSvc.externalId && !targetByName.externalId) {
        // Service exists but needs externalId
        servicesToUpdateExternalId.push({
          source: sourceSvc,
          target: targetByName,
        });
      } else if (!targetByName) {
        // Truly missing service
        servicesToCreate.push(sourceSvc);
      }
    }
  }
  
  // Create missing services
  if (servicesToCreate.length > 0) {
    console.error(`[Sync] Creating ${servicesToCreate.length} missing services...`);
    
    for (const svc of servicesToCreate) {
      // Find target category ID
      const catKey = getCategoryMatchKey(svc.category);
      const targetCat = targetCategoryMap.get(catKey);
      
      if (!targetCat) {
        console.error(`  [SKIP] Service "${svc.name}": category "${svc.category?.name}" not found in target`);
        results.errors.push({
          type: 'createService',
          name: svc.name,
          error: `Category "${svc.category?.name}" not found in target`,
        });
        continue;
      }
      
      const input = {
        name: svc.name,
        categoryId: ensureBlvdId(targetCat.id, 'ServiceCategory'),
      };
      
      if (svc.description) {
        input.description = svc.description;
      }
      if (typeof svc.addon === 'boolean') {
        input.addon = svc.addon;
      }
      if (svc.externalId) {
        input.externalId = svc.externalId;
      }
      
      if (dryRun) {
        console.error(`  [DRY RUN] Would create service: ${svc.name} (category: ${svc.category?.name})`);
        results.servicesCreated.push({ name: svc.name, categoryName: svc.category?.name, dryRun: true });
      } else {
        try {
          const response = await executeGraphQL(
            targetUrl,
            targetToken,
            CREATE_SERVICE_MUTATION,
            { input },
            { verbose }
          );
          
          if (hasErrors(response)) {
            const errMsg = formatErrors(response.errors);
            console.error(`  [ERROR] Failed to create service "${svc.name}": ${errMsg}`);
            results.errors.push({ type: 'createService', name: svc.name, error: errMsg });
          } else {
            const created = response.data?.createService?.service;
            console.error(`  [OK] Created service: ${svc.name} (${created?.id})`);
            results.servicesCreated.push({
              name: svc.name,
              categoryName: svc.category?.name,
              id: created?.id,
            });
          }
          
          await sleep(100);
        } catch (err) {
          console.error(`  [ERROR] Failed to create service "${svc.name}": ${err.message}`);
          results.errors.push({ type: 'createService', name: svc.name, error: err.message });
        }
      }
    }
  } else {
    console.error('[Sync] No missing services to create');
  }
  
  // Update externalIds
  if (servicesToUpdateExternalId.length > 0) {
    console.error(`[Sync] Updating ${servicesToUpdateExternalId.length} services with missing externalIds...`);
    
    for (const { source, target } of servicesToUpdateExternalId) {
      const input = {
        id: target.id,
        externalId: source.externalId,
      };
      
      if (dryRun) {
        console.error(`  [DRY RUN] Would set externalId for "${source.name}": ${source.externalId}`);
        results.externalIdsUpdated.push({
          name: source.name,
          externalId: source.externalId,
          dryRun: true,
        });
      } else {
        try {
          const response = await executeGraphQL(
            targetUrl,
            targetToken,
            UPDATE_SERVICE_MUTATION,
            { input },
            { verbose }
          );
          
          if (hasErrors(response)) {
            const errMsg = formatErrors(response.errors);
            console.error(`  [ERROR] Failed to update externalId for "${source.name}": ${errMsg}`);
            results.errors.push({ type: 'updateExternalId', name: source.name, error: errMsg });
          } else {
            console.error(`  [OK] Updated externalId for: ${source.name}`);
            results.externalIdsUpdated.push({
              name: source.name,
              externalId: source.externalId,
              targetId: target.id,
            });
          }
          
          await sleep(100);
        } catch (err) {
          console.error(`  [ERROR] Failed to update externalId for "${source.name}": ${err.message}`);
          results.errors.push({ type: 'updateExternalId', name: source.name, error: err.message });
        }
      }
    }
  } else {
    console.error('[Sync] No externalIds to update');
  }
  
  // Summary
  console.error('\n[Sync] Summary:');
  console.error(`  Categories created: ${results.categoriesCreated.length}`);
  console.error(`  Services created: ${results.servicesCreated.length}`);
  console.error(`  ExternalIds updated: ${results.externalIdsUpdated.length}`);
  console.error(`  Errors: ${results.errors.length}`);
  
  // Output detailed results as JSON
  console.log(JSON.stringify(results, null, 2));
  
  if (results.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
