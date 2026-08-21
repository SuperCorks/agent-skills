'use strict';

const { isDeepStrictEqual } = require('node:util');
const { SkillError } = require('./errors');
const { parseTaskUrl } = require('./url-parser');

function invalid(details) {
  throw new SkillError('ASANA_ARGUMENT_INVALID', details);
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required`);
  return value.trim();
}

function gid(value, label, { allowMe = false } = {}) {
  const normalized = requireString(String(value ?? ''), label);
  if (allowMe && normalized === 'me') return normalized;
  if (!/^\d+$/.test(normalized)) invalid(`${label} must be a numeric GID${allowMe ? ' or me' : ''}`);
  return normalized;
}

function optionalGid(value, label, options) {
  return value === undefined ? undefined : gid(value, label, options);
}

function taskTarget(args) {
  if (Boolean(args.id) === Boolean(args.url)) invalid('Pass exactly one of --id or --url');
  return args.id ? gid(args.id, '--id') : parseTaskUrl(args.url);
}

function bool(value, label) {
  if (value === true || value === false) return value;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  invalid(`${label} must be true or false`);
}

function date(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label} must use YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value) invalid(`${label} is not a real calendar date`);
  return value;
}

function dateTime(value, label) {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    invalid(`${label} must be an ISO 8601 timestamp with a timezone`);
  }
  return value;
}

function csvGids(value, label) {
  if (value === undefined) return [];
  const values = String(value).split(',').map((item) => item.trim()).filter(Boolean).map((item) => gid(item, label));
  return [...new Set(values)];
}

function assertAllowed(data, allowed, label = 'data') {
  const unknown = Object.keys(data).filter((key) => !allowed.includes(key));
  if (unknown.length) invalid(`${label} contains unsupported fields: ${unknown.join(', ')}`);
}

function mergePayload(data, scalarEntries, allowed) {
  assertAllowed(data, allowed);
  const payload = { ...data };
  for (const [field, value] of scalarEntries) {
    if (value === undefined) continue;
    if (Object.prototype.hasOwnProperty.call(data, field)) invalid(`${field} was supplied both as a flag and in data`);
    payload[field] = value;
  }
  return payload;
}

function validateTaskPayload(payload, { create = false } = {}) {
  if (create) payload.name = requireString(payload.name, 'Task name');
  if (payload.name !== undefined) payload.name = requireString(payload.name, 'Task name');
  if (payload.assignee !== undefined && payload.assignee !== null) payload.assignee = gid(payload.assignee, 'assignee', { allowMe: true });
  if (payload.followers !== undefined) {
    if (!Array.isArray(payload.followers)) invalid('followers must be an array of user GIDs');
    payload.followers = [...new Set(payload.followers.map((value) => gid(value, 'follower GID', { allowMe: true })) )];
  }
  if (payload.due_on !== undefined) payload.due_on = date(payload.due_on, 'due_on');
  if (payload.start_on !== undefined) payload.start_on = date(payload.start_on, 'start_on');
  if (payload.due_at !== undefined) payload.due_at = dateTime(payload.due_at, 'due_at');
  if (payload.start_at !== undefined) payload.start_at = dateTime(payload.start_at, 'start_at');
  if (payload.completed !== undefined) payload.completed = bool(payload.completed, 'completed');
  if (payload.due_on != null && payload.due_at != null) invalid('due_on and due_at are mutually exclusive');
  if (payload.start_on != null && payload.start_at != null) invalid('start_on and start_at are mutually exclusive');
  if (payload.start_on != null && payload.due_at != null) invalid('start_on must be paired with date-only due_on');
  if (payload.start_at != null && payload.due_on != null) invalid('start_at must be paired with timestamp due_at');
  if (payload.resource_subtype === 'milestone' && (payload.start_on != null || payload.start_at != null)) invalid('Milestones cannot have start dates');
  if (payload.custom_fields !== undefined) {
    if (!payload.custom_fields || typeof payload.custom_fields !== 'object' || Array.isArray(payload.custom_fields)) invalid('custom_fields must be an object keyed by field GID');
    for (const fieldGid of Object.keys(payload.custom_fields)) gid(fieldGid, 'custom field GID');
  }
  return payload;
}

function validateProjectPayload(payload, { create = false } = {}) {
  if (create) payload.name = requireString(payload.name, 'Project name');
  if (payload.name !== undefined) payload.name = requireString(payload.name, 'Project name');
  if (payload.start_on !== undefined) payload.start_on = date(payload.start_on, 'start_on');
  if (payload.due_on !== undefined) payload.due_on = date(payload.due_on, 'due_on');
  if (payload.owner !== undefined && payload.owner !== null) payload.owner = gid(payload.owner, 'owner', { allowMe: true });
  if (payload.team !== undefined && payload.team !== null) payload.team = gid(payload.team, 'team');
  if (payload.public !== undefined) payload.public = bool(payload.public, 'public');
  return payload;
}

function currentValue(resource, field) {
  if (field === 'assignee' || field === 'owner' || field === 'team') return resource[field]?.gid ?? null;
  if (field === 'followers') return (resource.followers || []).map((item) => item.gid).sort();
  if (field !== 'custom_fields') return resource[field] ?? null;
  return Object.fromEntries((resource.custom_fields || []).map((item) => {
    let value = item.text_value ?? item.number_value ?? item.date_value ?? item.display_value ?? null;
    if (item.enum_value) value = item.enum_value.gid;
    if (item.multi_enum_values) value = item.multi_enum_values.map((option) => option.gid);
    if (item.people_value) value = item.people_value.map((person) => person.gid);
    return [item.gid, value];
  }));
}

function changedPayload(resource, payload) {
  const changed = {};
  for (const [field, requested] of Object.entries(payload)) {
    let current = currentValue(resource, field);
    let normalized = requested;
    if (Array.isArray(current) && Array.isArray(requested)) {
      current = [...current].sort();
      normalized = [...requested].sort();
    }
    if (field === 'custom_fields') {
      const existing = current || {};
      const differences = Object.fromEntries(Object.entries(requested).filter(([key, value]) => !isDeepStrictEqual(existing[key] ?? null, value)));
      if (Object.keys(differences).length) changed[field] = differences;
    } else if (!isDeepStrictEqual(current, normalized)) {
      changed[field] = requested;
    }
  }
  return changed;
}

function choosePosition(args) {
  const atStart = args.atStart === undefined ? undefined : bool(args.atStart, '--at-start');
  const atEnd = args.atEnd === undefined ? undefined : bool(args.atEnd, '--at-end');
  const selected = [
    ...(args.before !== undefined ? ['before'] : []),
    ...(args.after !== undefined ? ['after'] : []),
    ...(atStart ? ['atStart'] : []),
    ...(atEnd ? ['atEnd'] : []),
  ];
  if (selected.length > 1) invalid('Choose only one of --before, --after, --at-start, or --at-end');
  if (args.before !== undefined) return { insert_before: gid(args.before, '--before') };
  if (args.after !== undefined) return { insert_after: gid(args.after, '--after') };
  if (atStart) return { insert_after: null };
  if (atEnd) return { insert_before: null };
  return {};
}

module.exports = {
  invalid, requireString, gid, optionalGid, taskTarget, bool, date, dateTime, csvGids,
  assertAllowed, mergePayload, validateTaskPayload, validateProjectPayload, changedPayload, choosePosition,
};
