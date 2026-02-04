/**
 * Boulevard API authentication utilities
 * 
 * Implements token generation per Boulevard docs:
 * - Admin: https://developers.joinblvd.com/2020-01/admin-api/authentication
 * - Client: https://developers.joinblvd.com/2020-01/client-api/authentication
 */

const crypto = require('crypto');

/**
 * Generate an Admin API token
 * 
 * Token structure:
 * 1. payload = "blvd-admin-v1" + BUSINESS_ID + timestamp
 * 2. signature = base64(hmac_sha256(payload, base64_decode(SECRET)))
 * 3. token = signature + payload
 * 4. credentials = base64(API_KEY + ":" + token)
 * 
 * @param {string} businessId
 * @param {string} apiKey
 * @param {string} apiSecret - Base64-encoded secret key
 * @returns {string} Base64-encoded HTTP Basic credentials
 */
function generateAdminToken(businessId, apiKey, apiSecret) {
  const prefix = 'blvd-admin-v1';
  // Boulevard allows slight clock skew; subtract 1s for safety (matches repo pattern)
  const timestamp = Math.floor((Date.now() - 1000) / 1000);
  const payload = `${prefix}${businessId}${timestamp}`;
  
  const rawKey = Buffer.from(apiSecret, 'base64');
  const signature = crypto
    .createHmac('sha256', rawKey)
    .update(payload, 'utf8')
    .digest('base64');
  
  const token = `${signature}${payload}`;
  const httpBasicPayload = `${apiKey}:${token}`;
  
  return Buffer.from(httpBasicPayload, 'utf8').toString('base64');
}

/**
 * Generate a Public (Guest) Client API token
 * 
 * Public access uses just the API key with no signature:
 * credentials = base64(API_KEY + ":")
 * 
 * @param {string} apiKey
 * @returns {string} Base64-encoded HTTP Basic credentials
 */
function generateGuestClientToken(apiKey) {
  const httpBasicPayload = `${apiKey}:`;
  return Buffer.from(httpBasicPayload, 'utf8').toString('base64');
}

/**
 * Generate a Known (Authenticated) Client API token
 * 
 * Token structure:
 * 1. payload = "blvd-client-v1" + BUSINESS_ID + CLIENT_ID + timestamp
 * 2. signature = base64(hmac_sha256(payload, base64_decode(SECRET)))
 * 3. token = signature + payload
 * 4. credentials = base64(API_KEY + ":" + token)
 * 
 * @param {string} businessId
 * @param {string} apiKey
 * @param {string} apiSecret - Base64-encoded secret key
 * @param {string} clientId - Client UUID (with or without urn:blvd:Client: prefix)
 * @returns {string} Base64-encoded HTTP Basic credentials
 */
function generateKnownClientToken(businessId, apiKey, apiSecret, clientId) {
  // Strip urn:blvd:Client: prefix if present (matches repo pattern)
  const strippedClientId = stripBlvdId(clientId);
  
  const prefix = 'blvd-client-v1';
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${prefix}${businessId}${strippedClientId}${timestamp}`;
  
  const rawKey = Buffer.from(apiSecret, 'base64');
  const signature = crypto
    .createHmac('sha256', rawKey)
    .update(payload, 'utf8')
    .digest('base64');
  
  const token = `${signature}${payload}`;
  const httpBasicPayload = `${apiKey}:${token}`;
  
  return Buffer.from(httpBasicPayload, 'utf8').toString('base64');
}

/**
 * Strip Boulevard URN prefix from an ID
 * e.g., "urn:blvd:Client:abc123" -> "abc123"
 * 
 * @param {string} id
 * @returns {string}
 */
function stripBlvdId(id) {
  if (!id) return id;
  return id.split(':').at(-1);
}

/**
 * Ensure an ID has the Boulevard URN prefix
 * e.g., "abc123" -> "urn:blvd:Service:abc123"
 * 
 * @param {string} id
 * @param {string} objectName - e.g., 'Service', 'ServiceCategory', 'Client'
 * @returns {string}
 */
function ensureBlvdId(id, objectName) {
  if (!id) return id;
  if (id.startsWith('urn:')) return id;
  return `urn:blvd:${objectName}:${id}`;
}

module.exports = {
  generateAdminToken,
  generateGuestClientToken,
  generateKnownClientToken,
  stripBlvdId,
  ensureBlvdId,
};
