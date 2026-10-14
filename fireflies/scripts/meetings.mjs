export const USER_QUERY = 'query VerifyAccess { user { user_id name email is_admin num_transcripts } }';

const metadata = `id title date dateString duration transcript_url organizer_email participants
  meeting_attendees { displayName name email }
  meeting_info { summary_status }`;
const summary = `summary { overview action_items keywords outline short_summary topics_discussed }`;
export const LIST_QUERY = `query Meetings(
  $keyword: String, $scope: String, $fromDate: DateTime, $toDate: DateTime,
  $limit: Int, $skip: Int, $participants: [String!], $organizers: [String!],
  $mine: Boolean, $channelId: String
) {
  transcripts(keyword: $keyword, scope: $scope, fromDate: $fromDate, toDate: $toDate,
    limit: $limit, skip: $skip, participants: $participants, organizers: $organizers,
    mine: $mine, channel_id: $channelId) { ${metadata} }
}`;

export function detailQuery(mode = 'transcript') {
  return `query Meeting($id: String!) { transcript(id: $id) {
    ${metadata} ${summary}
    ${mode === 'transcript' ? 'speakers { id name } sentences { index speaker_name speaker_id text start_time end_time }' : ''}
  } }`;
}

export function meetingId(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Supply a meeting ID or Fireflies transcript URL.');
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['app.fireflies.ai', 'fireflies.ai'].includes(url.hostname) || url.username || url.password) {
      throw new Error('Expected an HTTPS Fireflies transcript URL.');
    }
    const match = url.pathname.match(/^\/(?:view|transcript)\/([^/]+)\/?$/);
    if (!match) throw new Error('Expected a Fireflies /view/<id> transcript URL.');
    // Fireflies commonly uses /view/Meeting-Title::<id>.
    value = decodeURIComponent(match[1]).split('::').at(-1);
  }
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) throw new Error('Invalid Fireflies meeting ID.');
  return value;
}

export function isoDate(value, end = false) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid calendar date.');
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('Dates must be YYYY-MM-DD (UTC) or ISO timestamps with an explicit timezone.');
  }
  const date = new Date(value);
  const calendar = value.slice(0, 10);
  if (!Number.isFinite(date.getTime()) || new Date(`${calendar}T00:00:00Z`).toISOString().slice(0, 10) !== calendar) {
    throw new Error('Invalid ISO timestamp.');
  }
  return date.toISOString();
}

export function normalizeMeeting(meeting) {
  return {
    ...meeting,
    date_iso: meeting.dateString ?? (typeof meeting.date === 'number' ? new Date(meeting.date).toISOString() : null),
    duration_minutes: meeting.duration ?? null,
    transcript_url: meeting.transcript_url || `https://app.fireflies.ai/view/${encodeURIComponent(meeting.id)}`,
  };
}

export async function listMeetings(query, {
  filters = {}, limit = 20, skip = 0, all = false, maxPages = 20,
} = {}) {
  const meetings = [];
  const seen = new Set();
  const pageSize = all ? 50 : limit;
  let offset = skip;
  let pages = 0;
  let complete = false;
  let reason = all ? 'max_pages' : 'page_limit';
  for (; pages < (all ? maxPages : 1); ) {
    const data = await query(LIST_QUERY, { ...filters, limit: pageSize, skip: offset });
    if (!Array.isArray(data.transcripts)) throw new Error('Fireflies did not return a transcript list.');
    const page = data.transcripts;
    pages++;
    for (const meeting of page) {
      if (!seen.has(meeting.id)) {
        seen.add(meeting.id);
        meetings.push(normalizeMeeting(meeting));
      }
    }
    offset += page.length;
    if (page.length < pageSize) { complete = true; reason = 'exhausted'; break; }
  }
  return {
    meetings,
    filters,
    pagination: {
      returned: meetings.length, pages, start_skip: skip,
      next_skip: complete ? null : offset,
      complete, has_more: complete ? false : null, stopped_because: reason,
    },
  };
}

export async function readMeeting(query, value, mode = 'transcript') {
  const id = meetingId(value);
  const data = await query(detailQuery(mode), { id });
  if (!data.transcript) throw new Error(`Meeting '${id}' was not found or is not accessible to this account.`);
  return normalizeMeeting(data.transcript);
}

export function timestamp(seconds) {
  const number = Number(seconds);
  if (seconds == null || !Number.isFinite(number) || number < 0) return '--:--';
  const total = Math.floor(number);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  const s = total % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function selectSentences(meeting, { contains, speaker, start, end } = {}) {
  const sentences = meeting.sentences ?? [];
  return sentences.filter(sentence =>
    (!contains || (sentence.text ?? '').toLocaleLowerCase().includes(contains.toLocaleLowerCase())) &&
    (!speaker || (sentence.speaker_name ?? '').toLocaleLowerCase().includes(speaker.toLocaleLowerCase())) &&
    (start === undefined || (sentence.end_time != null && Number(sentence.end_time) >= start)) &&
    (end === undefined || (sentence.start_time != null && Number(sentence.start_time) <= end)));
}

export function renderMeeting(meeting, { mode = 'transcript', format = 'text' } = {}) {
  const markdown = format === 'markdown';
  const heading = name => markdown ? `## ${name}` : `${name}:`;
  const lines = [markdown ? `# ${meeting.title ?? 'Untitled meeting'}` : meeting.title ?? 'Untitled meeting',
    `Date: ${meeting.date_iso ?? 'Unknown'}`, `Duration: ${meeting.duration_minutes ?? 'Unknown'} minutes`,
    `Source: ${meeting.transcript_url}`, ''];
  if (mode !== 'action-items') {
    lines.push(heading('Summary'), meeting.summary?.overview || meeting.summary?.short_summary || 'Summary unavailable.', '');
  }
  lines.push(heading('Action items'), meeting.summary?.action_items || 'No action items returned by Fireflies.', '');
  if (mode === 'transcript') {
    lines.push(heading('Transcript'));
    if (!meeting.sentences?.length) lines.push('No transcript sentences returned for this selection.');
    for (const sentence of meeting.sentences ?? []) {
      lines.push(`[${timestamp(sentence.start_time)}–${timestamp(sentence.end_time)}] ${sentence.speaker_name || 'Unknown speaker'}: ${sentence.text ?? ''}`);
    }
  }
  return lines.join('\n') + '\n';
}
