/**
 * Parse Asana task URLs
 * 
 * Formats:
 * - https://app.asana.com/0/PROJECT/TASK
 * - https://app.asana.com/0/PROJECT/TASK/f
 * - https://app.asana.com/0/0/TASK/f (inbox/my tasks view)
 */

const { SkillError } = require('./errors');

/**
 * Parse an Asana task URL
 * 
 * @param {string} url - Asana task URL
 * @returns {{ taskGid: string, projectGid: string | null }}
 * @throws {SkillError} If the URL format is invalid
 */
function parseAsanaUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new SkillError('ASANA_URL_INVALID', 'URL is required');
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new SkillError('ASANA_URL_INVALID', 'Not a valid URL');
  }

  // Verify it's an Asana URL
  if (parsed.hostname !== 'app.asana.com') {
    throw new SkillError('ASANA_URL_INVALID', 'Not an Asana URL');
  }

  // Parse path: /0/PROJECT/TASK or /0/PROJECT/TASK/f
  const pathParts = parsed.pathname.split('/').filter(Boolean);
  
  // Expected: ["0", "PROJECT_GID", "TASK_GID"] or ["0", "PROJECT_GID", "TASK_GID", "f"]
  if (pathParts.length < 3 || pathParts[0] !== '0') {
    throw new SkillError('ASANA_URL_INVALID', 'Expected /0/PROJECT/TASK format');
  }

  const projectGid = pathParts[1];
  const taskGid = pathParts[2];

  // Validate GIDs are numeric
  if (!/^\d+$/.test(taskGid)) {
    throw new SkillError('ASANA_URL_INVALID', `Invalid task GID: ${taskGid}`);
  }

  // Project GID can be "0" for inbox/my tasks views
  if (!/^\d+$/.test(projectGid)) {
    throw new SkillError('ASANA_URL_INVALID', `Invalid project GID: ${projectGid}`);
  }

  return {
    taskGid,
    projectGid: projectGid === '0' ? null : projectGid,
  };
}

module.exports = {
  parseAsanaUrl,
};
