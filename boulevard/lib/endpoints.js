/**
 * Boulevard API endpoint builders
 * 
 * Per Boulevard docs:
 * - Admin API: https://sandbox.joinblvd.com/api/2020-01/admin (sandbox)
 *              https://dashboard.boulevard.io/api/2020-01/admin (prod)
 * - Client API: https://sandbox.joinblvd.com/api/2020-01/:business_id/client (sandbox)
 *               https://dashboard.boulevard.io/api/2020-01/:business_id/client (prod)
 */

const ENDPOINTS = {
  sandbox: {
    admin: 'https://sandbox.joinblvd.com/api/2020-01/admin',
    client: (businessId) => `https://sandbox.joinblvd.com/api/2020-01/${businessId}/client`,
  },
  prod: {
    admin: 'https://dashboard.boulevard.io/api/2020-01/admin',
    client: (businessId) => `https://dashboard.boulevard.io/api/2020-01/${businessId}/client`,
  },
};

/**
 * Get the Admin API URL for the given environment
 * @param {'sandbox' | 'prod'} env
 * @returns {string}
 */
function getAdminUrl(env) {
  const endpoints = ENDPOINTS[env];
  if (!endpoints) {
    throw new Error(`Invalid environment: ${env}. Use 'sandbox' or 'prod'.`);
  }
  return endpoints.admin;
}

/**
 * Get the Client API URL for the given environment and business
 * @param {'sandbox' | 'prod'} env
 * @param {string} businessId
 * @returns {string}
 */
function getClientUrl(env, businessId) {
  const endpoints = ENDPOINTS[env];
  if (!endpoints) {
    throw new Error(`Invalid environment: ${env}. Use 'sandbox' or 'prod'.`);
  }
  if (!businessId) {
    throw new Error('Business ID is required for Client API');
  }
  return endpoints.client(businessId);
}

module.exports = {
  getAdminUrl,
  getClientUrl,
  ENDPOINTS,
};
