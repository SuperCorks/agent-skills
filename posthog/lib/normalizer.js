function buildMetadata(account, client, options = {}) {
  return {
    fetchedAt: new Date().toISOString(),
    account,
    host: client.host,
    projectId: options.projectId || null,
    path: options.path || null,
    method: options.method || 'GET',
  };
}

function summarizeProject(project = {}) {
  return {
    id: project.id ?? project.project_id ?? null,
    name: project.name ?? null,
    organization: project.organization ?? null,
    createdAt: project.created_at ?? null,
    updatedAt: project.updated_at ?? null,
    timezone: project.timezone ?? null,
    isDemo: project.is_demo ?? false,
    userAccessLevel: project.user_access_level ?? null,
  };
}

function normalizeProjectList(response) {
  if (Array.isArray(response)) {
    return {
      count: response.length,
      next: null,
      previous: null,
      projects: response.map(summarizeProject),
    };
  }

  const projects = Array.isArray(response?.results) ? response.results : [];
  return {
    count: response?.count ?? projects.length,
    next: response?.next ?? null,
    previous: response?.previous ?? null,
    projects: projects.map(summarizeProject),
  };
}

module.exports = {
  buildMetadata,
  summarizeProject,
  normalizeProjectList,
};
