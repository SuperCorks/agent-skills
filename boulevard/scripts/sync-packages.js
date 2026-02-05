#!/usr/bin/env node
/**
 * Sync packages from source to target Boulevard environment (create-only)
 * 
 * Usage:
 *   node scripts/sync-packages.js \
 *     --source-env=prod \
 *     --source-business-id=PROD_BUSINESS_ID \
 *     --source-api-key=PROD_API_KEY \
 *     --source-api-secret=PROD_API_SECRET \
 *     --target-env=sandbox \
 *     --target-business-id=SANDBOX_BUSINESS_ID \
 *     --target-api-key=SANDBOX_API_KEY \
 *     --target-api-secret=SANDBOX_API_SECRET \
 *     [--filter=REGEX] \
 *     [--inactive] \
 *     [--dry-run]
 * 
 * Examples:
 *   # Sync all active packages
 *   node scripts/sync-packages.js --source-env=prod ... --target-env=sandbox ...
 * 
 *   # Sync only inactive packages matching a pattern
 *   node scripts/sync-packages.js --source-env=prod ... --target-env=sandbox ... \
 *     --inactive --filter="8x-LHR|Unlimited-LHR"
 */

const { parseArgs, validateRequired } = require('../lib/cli');
const { getAdminUrl } = require('../lib/endpoints');
const { generateAdminToken } = require('../lib/auth');
const { executeGraphQL, hasErrors, formatErrors, sleep } = require('../lib/graphql');

const LIST_SERVICES_QUERY = `
  query ListServices($first: Int!) {
    services(first: $first) {
      edges {
        node {
          id
          name
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const LIST_PACKAGES_QUERY = `
  query ListPackages($first: Int!, $inactive: Boolean) {
    packages(first: $first, inactive: $inactive) {
      edges {
        node {
          id
          name
          active
          unitPrice
          taxable
          commissionEnabled
          description
          externalId
          category {
            id
            name
          }
          vouchers {
            quantity
            services {
              id
              name
            }
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

const LIST_PACKAGE_CATEGORIES_QUERY = `
  query ListPackageCategories($first: Int!) {
    packageCategories(first: $first) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`;

const CREATE_PACKAGE_CATEGORY_MUTATION = `
  mutation CreatePackageCategory($input: CreatePackageCategoryInput!) {
    createPackageCategory(input: $input) {
      packageCategory {
        id
        name
      }
    }
  }
`;

const CREATE_PACKAGE_MUTATION = `
  mutation CreatePackage($input: CreatePackageInput!) {
    createPackage(input: $input) {
      package {
        id
        name
      }
    }
  }
`;

function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

async function fetchAllServices(url, token) {
  const resp = await executeGraphQL(url, token, LIST_SERVICES_QUERY, { first: 200 });
  if (hasErrors(resp)) {
    throw new Error(`Failed to fetch services: ${formatErrors(resp.errors)}`);
  }
  return resp.data.services.edges.map(e => e.node);
}

async function fetchAllPackages(url, token, inactive = false) {
  const resp = await executeGraphQL(url, token, LIST_PACKAGES_QUERY, { first: 100, inactive });
  if (hasErrors(resp)) {
    throw new Error(`Failed to fetch packages: ${formatErrors(resp.errors)}`);
  }
  return resp.data.packages.edges.map(e => e.node);
}

async function fetchPackageCategories(url, token) {
  const resp = await executeGraphQL(url, token, LIST_PACKAGE_CATEGORIES_QUERY, { first: 100 });
  if (hasErrors(resp)) {
    throw new Error(`Failed to fetch package categories: ${formatErrors(resp.errors)}`);
  }
  return resp.data.packageCategories.edges.map(e => e.node);
}

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    console.log(`
Usage: node scripts/sync-packages.js [options]

Sync packages from source to target Boulevard environment (create-only)

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
  --filter=REGEX    Filter source packages by name (JavaScript regex)
  --inactive        Sync inactive packages instead of active ones
  --dry-run         Preview changes without making mutations
  --verbose         Show detailed progress
  --help            Show this help message

Features:
  - Creates missing package categories in target
  - Creates missing packages with prices, vouchers, descriptions
  - Maps voucher service references to target service IDs by name
  - Never deletes or updates existing packages
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
  const inactive = args.inactive === true || args.inactive === 'true';
  const filterPattern = args.filter ? new RegExp(args.filter) : null;
  
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
  
  // Fetch target services for voucher mapping
  console.error(`[Sync] Fetching target services...`);
  const targetServices = await fetchAllServices(targetUrl, targetToken);
  const targetServiceMap = new Map();
  for (const svc of targetServices) {
    targetServiceMap.set(normalizeName(svc.name), svc.id);
  }
  console.error(`[Sync] Found ${targetServices.length} target services`);
  
  // Fetch target package categories
  console.error(`[Sync] Fetching target package categories...`);
  const targetCategories = await fetchPackageCategories(targetUrl, targetToken);
  const targetCategoryMap = new Map();
  for (const cat of targetCategories) {
    targetCategoryMap.set(normalizeName(cat.name), cat.id);
  }
  console.error(`[Sync] Found ${targetCategories.length} target package categories`);
  
  // Fetch existing target packages to avoid duplicates
  console.error(`[Sync] Fetching existing target packages...`);
  const existingPackages = await fetchAllPackages(targetUrl, targetToken, false);
  const existingInactivePackages = await fetchAllPackages(targetUrl, targetToken, true);
  const existingPackageNames = new Set();
  for (const pkg of [...existingPackages, ...existingInactivePackages]) {
    existingPackageNames.add(normalizeName(pkg.name));
  }
  console.error(`[Sync] Found ${existingPackageNames.size} existing target packages`);
  
  // Fetch source packages
  console.error(`[Sync] Fetching source packages (inactive=${inactive})...`);
  const sourcePackages = await fetchAllPackages(sourceUrl, sourceToken, inactive);
  
  // Apply filter
  let packagesToSync = sourcePackages;
  if (filterPattern) {
    packagesToSync = sourcePackages.filter(pkg => filterPattern.test(pkg.name));
    console.error(`[Sync] Filter "${args.filter}" matched ${packagesToSync.length} of ${sourcePackages.length} packages`);
  } else {
    console.error(`[Sync] Found ${packagesToSync.length} source packages`);
  }
  
  const results = {
    categoriesCreated: [],
    packagesCreated: [],
    skipped: [],
    errors: [],
  };
  
  // Create missing categories first
  const neededCategories = new Set();
  for (const pkg of packagesToSync) {
    if (pkg.category?.name) {
      neededCategories.add(pkg.category.name);
    }
  }
  
  for (const catName of neededCategories) {
    if (!targetCategoryMap.has(normalizeName(catName))) {
      if (dryRun) {
        console.error(`  [DRY RUN] Would create category: ${catName}`);
        results.categoriesCreated.push({ name: catName, dryRun: true });
        // Add placeholder for package creation
        targetCategoryMap.set(normalizeName(catName), 'DRY_RUN_ID');
      } else {
        try {
          const resp = await executeGraphQL(targetUrl, targetToken, CREATE_PACKAGE_CATEGORY_MUTATION, {
            input: { name: catName }
          });
          if (hasErrors(resp)) {
            console.error(`  [ERROR] Failed to create category "${catName}": ${formatErrors(resp.errors)}`);
            results.errors.push({ type: 'category', name: catName, error: formatErrors(resp.errors) });
          } else {
            const created = resp.data?.createPackageCategory?.packageCategory;
            console.error(`  [OK] Created category: ${catName} (${created?.id})`);
            results.categoriesCreated.push({ name: catName, id: created?.id });
            targetCategoryMap.set(normalizeName(catName), created.id);
          }
          await sleep(100);
        } catch (err) {
          console.error(`  [ERROR] Failed to create category "${catName}": ${err.message}`);
          results.errors.push({ type: 'category', name: catName, error: err.message });
        }
      }
    }
  }
  
  // Create packages
  for (const pkg of packagesToSync) {
    // Skip if already exists
    if (existingPackageNames.has(normalizeName(pkg.name))) {
      if (verbose) {
        console.error(`  [SKIP] Package already exists: ${pkg.name}`);
      }
      results.skipped.push({ name: pkg.name, reason: 'already exists' });
      continue;
    }
    
    // Get target category ID
    const targetCategoryId = pkg.category?.name 
      ? targetCategoryMap.get(normalizeName(pkg.category.name))
      : null;
    
    if (pkg.category?.name && !targetCategoryId) {
      console.error(`  [ERROR] Category not found for package "${pkg.name}": ${pkg.category.name}`);
      results.errors.push({ name: pkg.name, error: `Category not found: ${pkg.category.name}` });
      continue;
    }
    
    // Map voucher services to target IDs
    const productVouchers = [];
    let missingServices = [];
    
    for (const voucher of pkg.vouchers || []) {
      const voucherServices = [];
      
      for (const svc of voucher.services || []) {
        const targetServiceId = targetServiceMap.get(normalizeName(svc.name));
        if (!targetServiceId) {
          missingServices.push(svc.name);
        } else {
          voucherServices.push({ serviceId: targetServiceId });
        }
      }
      
      if (voucherServices.length > 0) {
        productVouchers.push({
          quantity: voucher.quantity,
          productVoucherServices: voucherServices,
        });
      }
    }
    
    if (missingServices.length > 0) {
      console.error(`  [ERROR] Missing services for package "${pkg.name}": ${missingServices.join(', ')}`);
      results.errors.push({ name: pkg.name, error: `Missing services: ${missingServices.join(', ')}` });
      continue;
    }
    
    const input = {
      name: pkg.name,
      unitPrice: pkg.unitPrice,
      taxable: pkg.taxable,
      commissionEnabled: pkg.commissionEnabled,
      active: pkg.active,
    };
    
    if (targetCategoryId && targetCategoryId !== 'DRY_RUN_ID') {
      input.categoryId = targetCategoryId;
    }
    if (pkg.description) {
      input.description = pkg.description;
    }
    if (pkg.externalId) {
      input.externalId = pkg.externalId;
    }
    if (productVouchers.length > 0) {
      input.productVouchers = productVouchers;
    }
    
    if (dryRun) {
      console.error(`  [DRY RUN] Would create package: ${pkg.name} ($${pkg.unitPrice / 100})`);
      results.packagesCreated.push({ name: pkg.name, dryRun: true });
    } else {
      try {
        const response = await executeGraphQL(targetUrl, targetToken, CREATE_PACKAGE_MUTATION, { input });
        
        if (hasErrors(response)) {
          const errMsg = formatErrors(response.errors);
          console.error(`  [ERROR] Failed to create "${pkg.name}": ${errMsg}`);
          results.errors.push({ name: pkg.name, error: errMsg });
        } else {
          const created = response.data?.createPackage?.package;
          console.error(`  [OK] Created package: ${pkg.name} (${created?.id})`);
          results.packagesCreated.push({ name: pkg.name, id: created?.id, unitPrice: pkg.unitPrice });
        }
        
        await sleep(100);
      } catch (err) {
        console.error(`  [ERROR] Failed to create "${pkg.name}": ${err.message}`);
        results.errors.push({ name: pkg.name, error: err.message });
      }
    }
  }
  
  console.error('\n[Sync] Summary:');
  console.error(`  Categories created: ${results.categoriesCreated.length}`);
  console.error(`  Packages created: ${results.packagesCreated.length}`);
  console.error(`  Skipped: ${results.skipped.length}`);
  console.error(`  Errors: ${results.errors.length}`);
  
  console.log(JSON.stringify(results, null, 2));
  
  if (results.errors.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
