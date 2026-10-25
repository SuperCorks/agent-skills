import { readFileSync } from "node:fs";
import { fail, paginate } from "./client.mjs";

const page = "pageInfo { hasNextPage endCursor }";
const issueFields = `id identifier url title description priority estimate dueDate createdAt updatedAt archivedAt
  team { id key name } state { id name type } assignee { id name email }
  project { id name } cycle { id number name } parent { id identifier }`;
const projectFields = `id name url description content startDate targetDate updatedAt archivedAt
  status { id name type } lead { id name email } teams(first: 100) { nodes { id key name } ${page} }`;
const issueWriteFields = `${issueFields} labels(first: 100) { nodes { id name } ${page} }`;

export const queries = {
  verify:
    "query SkillIdentity { viewer { id name email } organization { id name urlKey } }",
  issue: `query SkillIssue($id: String!) { result: issue(id: $id) { ${issueFields}
    labels(first: 100) { nodes { id name } ${page} }
    children(first: 100) { nodes { id identifier title url } ${page} } } }`,
  project: `query SkillProject($id: String!) { result: project(id: $id) { ${projectFields} } }`,
  comments: `query SkillComments($id: String!, $first: Int!, $after: String) {
    issue(id: $id) { result: comments(first: $first, after: $after) {
      nodes { id body url createdAt updatedAt user { id name email } } ${page} } } }`,
  issues: `query SkillIssues($first: Int!, $after: String, $filter: IssueFilter) {
    result: issues(first: $first, after: $after, filter: $filter, orderBy: updatedAt) { nodes { ${issueFields} } ${page} } }`,
  search: `query SkillSearch($first: Int!, $after: String, $filter: IssueFilter, $term: String!) {
    result: searchIssues(first: $first, after: $after, filter: $filter, term: $term) { nodes { ${issueFields} } ${page} } }`,
  teams: `query SkillTeams($first: Int!, $after: String) { result: teams(first: $first, after: $after) { nodes { id key name } ${page} } }`,
  users: `query SkillUsers($first: Int!, $after: String, $filter: UserFilter) { result: users(first: $first, after: $after, filter: $filter) { nodes { id name displayName email active } ${page} } }`,
  states: `query SkillStates($first: Int!, $after: String, $filter: WorkflowStateFilter) { result: workflowStates(first: $first, after: $after, filter: $filter) { nodes { id name type position team { id key name } } ${page} } }`,
  labels: `query SkillLabels($first: Int!, $after: String, $filter: IssueLabelFilter) { result: issueLabels(first: $first, after: $after, filter: $filter) { nodes { id name team { id key name } } ${page} } }`,
  cycles: `query SkillCycles($first: Int!, $after: String, $filter: CycleFilter) { result: cycles(first: $first, after: $after, filter: $filter) { nodes { id name number startsAt endsAt team { id key name } } ${page} } }`,
  projects: `query SkillProjects($first: Int!, $after: String, $filter: ProjectFilter) { result: projects(first: $first, after: $after, filter: $filter) { nodes { id name url description status { id name type } lead { id name email } } ${page} } }`,
  "project-statuses": `query SkillProjectStatuses($first: Int!, $after: String) { result: projectStatuses(first: $first, after: $after) { nodes { id name type } ${page} } }`,
  "create-issue": `mutation SkillCreateIssue($input: IssueCreateInput!) { result: issueCreate(input: $input) { success issue { ${issueWriteFields} } } }`,
  "update-issue": `mutation SkillUpdateIssue($id: String!, $input: IssueUpdateInput!) { result: issueUpdate(id: $id, input: $input) { success issue { ${issueWriteFields} } } }`,
  "create-project": `mutation SkillCreateProject($input: ProjectCreateInput!) { result: projectCreate(input: $input) { success project { ${projectFields} } } }`,
  "update-project": `mutation SkillUpdateProject($id: String!, $input: ProjectUpdateInput!) { result: projectUpdate(id: $id, input: $input) { success project { ${projectFields} } } }`,
  comment: `mutation SkillComment($input: CommentCreateInput!) { result: commentCreate(input: $input) { success comment { id body url createdAt user { id name email } } } }`,
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value, label) {
  if (!uuidPattern.test(value || ""))
    fail("INVALID_INPUT", `${label} must be a discovered UUID.`);
  return value;
}

export function issueId(value, workspace) {
  if (typeof value !== "string")
    fail(
      "INVALID_INPUT",
      "Provide --issue with an issue identifier, UUID, or Linear issue URL.",
    );
  if (/^https?:/.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      fail("INVALID_INPUT", "Invalid Linear issue URL.");
    }
    const match = url.pathname.match(
      /^\/([^/]+)\/issue\/([A-Z][A-Z0-9]*-\d+)(?:\/|$)/i,
    );
    if (
      url.protocol !== "https:" ||
      url.hostname !== "linear.app" ||
      url.port ||
      url.username ||
      url.password ||
      !match
    )
      fail(
        "INVALID_INPUT",
        "Expected an https://linear.app/WORKSPACE/issue/TEAM-123/... URL.",
      );
    if (match[1] !== workspace.urlKey)
      fail("WORKSPACE_MISMATCH", "The issue URL belongs to another workspace.");
    return match[2].toUpperCase();
  }
  if (!uuidPattern.test(value) && !/^[A-Z][A-Z0-9]*-\d+$/i.test(value))
    fail("INVALID_INPUT", "Expected an issue UUID, identifier, or Linear URL.");
  return uuidPattern.test(value) ? value : value.toUpperCase();
}

function date(value, label) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail("INVALID_INPUT", `${label} must be a real YYYY-MM-DD date.`);
  return value;
}

function text(options, field) {
  if (options[field] !== undefined && options[`${field}-file`] !== undefined)
    fail("INVALID_INPUT", `Choose --${field} or --${field}-file.`);
  if (options[`${field}-file`] !== undefined) {
    try {
      return readFileSync(options[`${field}-file`], "utf8");
    } catch {
      fail("INVALID_INPUT", `Cannot read --${field}-file.`);
    }
  }
  return options[field];
}

function integer(value, label, min, max) {
  if (
    !/^\d+$/.test(String(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    fail("INVALID_INPUT", `${label} must be an integer from ${min} to ${max}.`);
  return Number(value);
}

function ids(value, label) {
  const result = value.split(",").map((id) => uuid(id.trim(), label));
  if (new Set(result).size !== result.length)
    fail("INVALID_INPUT", `${label} contains duplicate IDs.`);
  return result;
}

export const commonOptions = ["account", "workspace", "help"];
const pagination = ["all", "limit", "after"];
const issueOptions = [
  "title",
  "description",
  "description-file",
  "state",
  "assignee",
  "project",
  "cycle",
  "parent",
  "priority",
  "estimate",
  "due",
  "labels",
];
const projectOptions = [
  "name",
  "description",
  "description-file",
  "content",
  "content-file",
  "status",
  "lead",
  "start",
  "target",
];
export const commandOptions = {
  accounts: [],
  verify: [],
  teams: pagination,
  users: [...pagination, "query"],
  states: [...pagination, "team"],
  labels: [...pagination, "team"],
  cycles: [...pagination, "team"],
  projects: [...pagination, "team", "query"],
  "project-statuses": pagination,
  issue: ["issue"],
  project: ["project"],
  comments: [...pagination, "issue"],
  issues: [
    ...pagination,
    "team",
    "query",
    "assignee",
    "project",
    "state",
    "priority",
    "updated-since",
  ],
  "create-issue": ["team", ...issueOptions, "dry-run", "allow-duplicate"],
  "update-issue": [
    "issue",
    ...issueOptions,
    "add-labels",
    "remove-labels",
    "clear",
    "dry-run",
  ],
  "create-project": ["teams", ...projectOptions, "dry-run", "allow-duplicate"],
  "update-project": ["project", ...projectOptions, "clear", "dry-run"],
  comment: ["issue", "body", "body-file", "post", "dry-run"],
};

function required(options, key) {
  if (!options[key]?.trim()) fail("INVALID_INPUT", `--${key} is required.`);
  return options[key];
}

function person(value, viewer) {
  return value === "me" ? viewer.id : uuid(value, "User");
}

export function mutationInput(command, options, identity) {
  const input = {};
  if (command === "comment") {
    const body = text(options, "body");
    if (!body?.trim())
      fail("INVALID_INPUT", "A nonempty --body or --body-file is required.");
    return { body };
  }
  const project = command.endsWith("project");
  for (const key of project
    ? ["name", "description", "content"]
    : ["title", "description"]) {
    const value = text(options, key);
    if (value !== undefined) {
      if (["title", "name"].includes(key) && !value.trim())
        fail("INVALID_INPUT", `${key} must not be blank.`);
      input[key] = value;
    }
  }
  if (command === "create-issue") {
    required(options, "title");
    input.teamId = uuid(required(options, "team"), "Team");
  }
  if (command === "create-project") {
    required(options, "name");
    input.teamIds = ids(required(options, "teams"), "Teams");
  }
  for (const key of project
    ? ["status", "lead"]
    : ["state", "assignee", "project", "cycle", "parent"]) {
    if (options[key] !== undefined)
      input[`${key}Id`] = ["assignee", "lead"].includes(key)
        ? person(options[key], identity.viewer)
        : uuid(options[key], key);
  }
  for (const [key, field] of project
    ? [
        ["start", "startDate"],
        ["target", "targetDate"],
      ]
    : [["due", "dueDate"]]) {
    if (options[key] !== undefined) input[field] = date(options[key], key);
  }
  if (options.priority !== undefined)
    input.priority = integer(options.priority, "Priority", 0, 4);
  if (options.estimate !== undefined)
    input.estimate = integer(options.estimate, "Estimate", 0, 2147483647);
  if (options.labels !== undefined)
    input.labelIds = ids(options.labels, "Labels");
  for (const [key, field] of [
    ["add-labels", "addedLabelIds"],
    ["remove-labels", "removedLabelIds"],
  ]) {
    if (options[key] !== undefined) {
      if (
        options.labels !== undefined ||
        options.clear?.split(",").includes("labels")
      )
        fail(
          "INVALID_INPUT",
          "Do not combine label replacement/clearing with incremental label changes.",
        );
      input[field] = ids(options[key], key);
    }
  }
  if (input.addedLabelIds?.some((id) => input.removedLabelIds?.includes(id)))
    fail("INVALID_INPUT", "A label cannot be both added and removed.");
  const clearable = project
    ? {
        description: "description",
        content: "content",
        lead: "leadId",
        start: "startDate",
        target: "targetDate",
      }
    : {
        description: "description",
        assignee: "assigneeId",
        project: "projectId",
        cycle: "cycleId",
        parent: "parentId",
        due: "dueDate",
        estimate: "estimate",
        labels: "labelIds",
      };
  for (const key of options.clear?.split(",") || []) {
    const field = clearable[key];
    if (!field || Object.hasOwn(input, field))
      fail("INVALID_INPUT", `Invalid or conflicting --clear field: ${key}.`);
    input[field] = key === "labels" ? [] : null;
  }
  if (!Object.keys(input).length)
    fail("INVALID_INPUT", "Provide at least one field to update.");
  return input;
}

export async function execute(command, options, client) {
  const identity = await client(queries.verify);
  if (
    !identity.viewer?.id ||
    !identity.organization?.id ||
    !identity.organization.urlKey
  )
    fail("INVALID_RESPONSE", "Linear did not return a workspace identity.");
  const write =
    command.startsWith("create-") ||
    command.startsWith("update-") ||
    command === "comment";
  if (write) uuid(required(options, "workspace"), "Workspace");
  if (options.workspace && options.workspace !== identity.organization.id)
    fail(
      "WORKSPACE_MISMATCH",
      "Selected credentials belong to a different workspace.",
      { actualWorkspace: identity.organization.id },
    );
  const metadata = {
    workspace: identity.organization,
    viewer: identity.viewer,
  };
  if (command === "verify") return { metadata };
  if (command === "issue" || command === "project") {
    const id =
      command === "issue"
        ? issueId(required(options, "issue"), identity.organization)
        : uuid(required(options, "project"), "Project");
    const { result } = await client(queries[command], { id });
    if (!result) fail("NOT_FOUND", "Resource not found or inaccessible.");
    return { metadata, result };
  }
  if (!write) {
    const filter = {};
    if (options.team) {
      const team = { id: { eq: uuid(options.team, "Team") } };
      filter[command === "projects" ? "accessibleTeams" : "team"] = team;
      if (command === "labels") {
        delete filter.team;
        filter.or = [{ team }, { team: { null: true } }];
      }
    }
    for (const key of ["project", "state"])
      if (options[key]) filter[key] = { id: { eq: uuid(options[key], key) } };
    if (options.assignee)
      filter.assignee = {
        id: { eq: person(options.assignee, identity.viewer) },
      };
    if (options.priority !== undefined)
      filter.priority = { eq: integer(options.priority, "Priority", 0, 4) };
    if (options["updated-since"]) {
      if (
        !/^\d{4}-\d{2}-\d{2}T/.test(options["updated-since"]) ||
        !Number.isFinite(Date.parse(options["updated-since"]))
      )
        fail("INVALID_INPUT", "--updated-since requires an ISO timestamp.");
      filter.updatedAt = { gte: options["updated-since"] };
    }
    if (options.query && command === "projects")
      filter.name = { containsIgnoreCase: options.query };
    if (options.query && command === "users")
      filter.or = [
        { name: { containsIgnoreCase: options.query } },
        { email: { containsIgnoreCase: options.query } },
      ];
    let query = queries[command];
    const variables = { filter };
    if (command === "comments") {
      variables.id = issueId(required(options, "issue"), identity.organization);
      const nestedClient = async (q, v) => {
        const data = await client(q, v);
        if (!data.issue) fail("NOT_FOUND", "Issue not found or inaccessible.");
        return data.issue;
      };
      return {
        metadata,
        ...(await paginate(
          nestedClient,
          query,
          variables,
          pageOptions(options),
        )),
      };
    }
    if (command === "issues" && options.query) {
      query = queries.search;
      variables.term = options.query;
    }
    return {
      metadata,
      ...(await paginate(client, query, variables, pageOptions(options))),
    };
  }
  const input = mutationInput(command, options, identity);
  let before = null;
  let id;
  if (command === "update-issue" || command === "comment") {
    id = issueId(required(options, "issue"), identity.organization);
    before = (await client(queries.issue, { id })).result;
  } else if (command === "update-project") {
    id = uuid(required(options, "project"), "Project");
    before = (await client(queries.project, { id })).result;
  }
  if ((command.startsWith("update-") || command === "comment") && !before)
    fail("NOT_FOUND", "Target not found or inaccessible.");
  if (command === "comment") input.issueId = before.id;
  if (command.startsWith("create-") && !options["allow-duplicate"]) {
    const issue = command === "create-issue";
    const filter = issue
      ? {
          title: { eqIgnoreCase: input.title },
          team: { id: { eq: input.teamId } },
        }
      : { name: { eqIgnoreCase: input.name } };
    const duplicates = await paginate(
      client,
      queries[issue ? "issues" : "projects"],
      { filter },
      { limit: 1 },
    );
    if (duplicates.nodes.length)
      fail(
        "DUPLICATE",
        "A matching item already exists. Inspect it before intentionally using --allow-duplicate.",
        {
          matches: duplicates.nodes.map(
            ({ id, identifier, url, title, name }) => ({
              id,
              identifier,
              url,
              title,
              name,
            }),
          ),
        },
      );
  }
  const dryRun = Boolean(
    options["dry-run"] || (command === "comment" && !options.post),
  );
  const requested = { ...(id ? { id } : {}), input };
  if (dryRun)
    return { metadata, operation: command, dryRun, before, requested };
  const { result } = await client(queries[command], requested);
  const resource = result?.issue ?? result?.project ?? result?.comment;
  if (result?.success !== true || !resource?.id)
    fail(
      "WRITE_NOT_CONFIRMED",
      "Linear did not confirm the write. Re-read before retrying.",
    );
  return {
    metadata,
    operation: command,
    dryRun,
    before,
    requested,
    result: resource,
  };
}

function pageOptions(options) {
  return {
    all: Boolean(options.all),
    limit:
      options.limit === undefined
        ? 50
        : integer(options.limit, "Limit", 1, 100),
    after: options.after || null,
  };
}
