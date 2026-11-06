#!/usr/bin/env python3
"""Collect one window of the user's attention evidence from a T3 environment database.

Read-only. Prints JSON per thread: attention log views and read aloud listens, the user's own
messages, and touches such as approvals. Before the environment kept an attention log, it falls
back to thread switches and, with --read-aloud-dir, the first plays found in the read aloud cache.
"""

import argparse
from collections import defaultdict
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from zoneinfo import ZoneInfo

# An autoplay listen counts only with other signs of the user within this distance.
PRESENCE_WINDOW = timedelta(minutes=10)
# Cached recordings are matched to answers written up to this long before the first play.
ANSWER_LOOKBACK = timedelta(days=3)
MIN_TRANSCRIPT_MATCH = 0.5
TOUCH_COMMANDS = {
    'runtime-request.respond': 'approval',
    'thread.settle': 'settle',
    'thread.stop': 'stop',
    'thread.snooze': 'snooze',
    'thread.pin': 'pin',
    'queued-message.promote-to-steer': 'steer',
}
# How the read aloud cache names a recording (see the fork's readAloud/ReadAloud.ts).
SPEECH_MODEL = 'simba-3.5'
SSML_VERSION = 'ssml-breaks-v1'
DEFAULT_VOICE = 'beatrice_32'


def parse(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.utcoffset() is None:
        raise ValueError(f'Timestamp needs an explicit offset: {value}')
    return result


def iso(value, zone):
    return value.astimezone(zone).isoformat(timespec='seconds')


def utc(value):
    return value.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def connect(path):
    """Read-only. A stopped environment's WAL database has no shared memory file to open, and
    nothing writes to it, so it is read as immutable."""
    uri = f'file:{Path(path).expanduser()}'
    try:
        db = sqlite3.connect(f'{uri}?mode=ro', uri=True)
        db.execute('SELECT 1 FROM sqlite_master').fetchone()
        return db
    except sqlite3.OperationalError:
        return sqlite3.connect(f'{uri}?mode=ro&immutable=1', uri=True)


def has_table(db, name):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()


def merge(intervals):
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged


def words(text):
    return set(re.findall(r'[a-z0-9]{4,}', text.lower()))


def similarity(a, b):
    return len(a & b) / (len(a | b) or 1)


def clip(start, end, window):
    start, end = max(start, window[0]), min(end, window[1])
    return (start, end) if end > start else None


def thread_titles(db):
    projects = {}
    if has_table(db, 'projection_projects'):
        projects = dict(db.execute('SELECT project_id, title FROM projection_projects'))
    return {thread_id: (title, projects.get(project_id))
            for thread_id, project_id, title in db.execute(
                'SELECT thread_id, project_id, title FROM orchestration_v2_projection_threads')}


def attention_log(db, window):
    """Views and listens overlapping the window, and when the log began."""
    if not has_table(db, 'attention_log'):
        return [], None
    began = db.execute('SELECT MIN(started_at) FROM attention_log').fetchone()[0]
    rows = db.execute(
        'SELECT kind, thread_id, surface, started_at, ended_at, details_json FROM attention_log '
        'WHERE started_at < ? AND ended_at > ? ORDER BY started_at',
        (utc(window[1]), utc(window[0] - timedelta(days=1))))
    entries = []
    for kind, thread_id, surface, started_at, ended_at, details in rows:
        span = clip(parse(started_at), parse(ended_at), window)
        if span:
            entries.append((kind, thread_id, surface, span, json.loads(details)))
    return entries, (parse(began) if began else None)


def user_messages(db, window):
    rows = db.execute(
        "SELECT thread_id, created_at, payload_json FROM orchestration_v2_projection_messages "
        "WHERE role = 'user' AND created_at >= ? AND created_at < ?",
        (utc(window[0] - timedelta(hours=1)), utc(window[1] + timedelta(hours=1))))
    for thread_id, created_at, payload in rows:
        message = json.loads(payload)
        at = parse(created_at)
        if window[0] <= at < window[1] and message.get('createdBy') == 'user' and not message.get('notification'):
            yield thread_id, at


def receipts(db, window, types):
    marks = ','.join('?' * len(types))
    rows = db.execute(
        f"SELECT aggregate_id, command_type, accepted_at FROM orchestration_command_receipts "
        f"WHERE aggregate_kind = 'thread' AND command_type IN ({marks}) "
        f"AND accepted_at >= ? AND accepted_at < ? ORDER BY accepted_at",
        (*types, utc(window[0] - timedelta(hours=6)), utc(window[1])))
    return [(thread_id, kind, parse(at)) for thread_id, kind, at in rows]


def read_aloud_first_plays(db, cache_dir, window, before):
    """Recordings first played in the window, matched to the answer or plan they spoke."""
    cache = Path(cache_dir).expanduser()
    settings = cache.parent / 'settings.json'
    voice = DEFAULT_VOICE
    if settings.exists():
        voice = (json.loads(settings.read_text()).get('readAloud') or {}).get('voiceId') or voice
    recordings = {}
    for path in cache.glob('*.mp3'):
        info = path.stat()
        born = datetime.fromtimestamp(getattr(info, 'st_birthtime', info.st_mtime), timezone.utc)
        if window[0] <= born < min(window[1], before):
            recordings[path.stem] = born
    transcripts = {}
    for path in cache.glob('*.txt'):
        key = hashlib.sha256(json.dumps(
            {'v': 1, 'transcriptKey': path.stem, 'voiceId': voice, 'model': SPEECH_MODEL,
             'ssml': SSML_VERSION}, separators=(',', ':')).encode()).hexdigest()[:32]
        if key in recordings:
            transcripts[key] = path
    if not recordings:
        return [], 0
    earliest = min(recordings.values()) - ANSWER_LOOKBACK
    answers = []
    for thread_id, created_at, payload in db.execute(
            "SELECT thread_id, created_at, payload_json FROM orchestration_v2_projection_messages "
            "WHERE role = 'assistant' AND streaming = 0 AND created_at >= ?", (utc(earliest),)):
        text = json.loads(payload).get('text') or ''
        if text.strip():
            answers.append((thread_id, parse(created_at), words(text)))
    plans = []
    for thread_id, payload in db.execute(
            "SELECT thread_id, payload_json FROM orchestration_v2_projection_plans WHERE kind = 'proposed_plan'"):
        text = json.loads(payload).get('markdown') or ''
        if text.strip():
            plans.append((thread_id, words(text)))
    plays, unmatched = [], 0
    for key, born in sorted(recordings.items(), key=lambda item: item[1]):
        path = transcripts.get(key)
        spoken = words(path.read_text()) if path else set()
        candidates = [(similarity(spoken, w), t) for t, at, w in answers if at <= born]
        candidates += [(similarity(spoken, w), t) for t, w in plans]
        score, thread_id = max(candidates, default=(0, None))
        if len(spoken) < 20 or score < MIN_TRANSCRIPT_MATCH:
            unmatched += 1
        else:
            plays.append((thread_id, born, round(score, 2)))
    return plays, unmatched


def collect(db, window, zone, cache_dir=None):
    titles = thread_titles(db)
    threads = defaultdict(lambda: {'views': [], 'listens': [], 'userMessages': [], 'touches': [],
                                   'switches': [], 'firstPlays': []})
    entries, log_began = attention_log(db, window)
    fallback_until = min(window[1], log_began) if log_began else window[1]
    presence = []
    for kind, thread_id, surface, (start, end), details in entries:
        if kind == 'thread-view':
            threads[thread_id]['views'].append((start, end, surface, details.get('endedBy')))
            presence.append((start, end))
        else:
            threads[thread_id]['listens'].append((start, end, surface, details))
    for thread_id, at in user_messages(db, window):
        threads[thread_id]['userMessages'].append(at)
        presence.append((at, at))
    for thread_id, kind, at in receipts(db, window, list(TOUCH_COMMANDS)):
        if at >= window[0]:
            threads[thread_id]['touches'].append((at, TOUCH_COMMANDS[kind]))
            presence.append((at, at))
    if fallback_until > window[0]:
        previous = None
        for thread_id, _, at in receipts(db, (window[0], fallback_until), ['thread.visit']):
            if previous is not None and thread_id != previous and at >= window[0]:
                threads[thread_id]['switches'].append(at)
            previous = thread_id
    unmatched_plays = 0
    if cache_dir and fallback_until > window[0]:
        plays, unmatched_plays = read_aloud_first_plays(db, cache_dir, window, fallback_until)
        for thread_id, at, score in plays:
            threads[thread_id]['firstPlays'].append((at, score))

    def present(start, end):
        return any(s - PRESENCE_WINDOW <= end and start <= e + PRESENCE_WINDOW for s, e in presence)

    result = []
    for thread_id, evidence in threads.items():
        listens = [{'start': iso(s, zone), 'end': iso(e, zone), 'surface': surface,
                    'startedBy': d.get('startedBy'), 'finished': d.get('finished'),
                    'counted': d.get('startedBy') == 'user' or present(s, e)}
                   for s, e, surface, d in evidence['listens']]
        attended = merge([(s, e) for s, e, _, _ in evidence['views']]
                         + [(s, e) for (s, e, _, d), listen in zip(evidence['listens'], listens)
                            if listen['counted']])
        title, project = titles.get(thread_id, (None, None))
        first = min([s for s, *_ in evidence['views'] + evidence['listens']]
                    + evidence['userMessages'] + [at for at, _ in evidence['touches']]
                    + evidence['switches'] + [at for at, _ in evidence['firstPlays']])
        result.append((first, {
            'threadId': thread_id,
            'title': title,
            'project': project,
            'attendedMinutes': round(sum((e - s).total_seconds() for s, e in attended) / 60, 1),
            'attended': [[iso(s, zone), iso(e, zone)] for s, e in attended],
            'views': [{'start': iso(s, zone), 'end': iso(e, zone), 'surface': surface,
                       'endedBy': ended} for s, e, surface, ended in evidence['views']],
            'listens': listens,
            'userMessages': [iso(at, zone) for at in sorted(evidence['userMessages'])],
            'touches': [{'at': iso(at, zone), 'kind': kind} for at, kind in sorted(evidence['touches'])],
            'switches': [iso(at, zone) for at in evidence['switches']],
            'firstPlays': [{'at': iso(at, zone), 'match': score} for at, score in evidence['firstPlays']],
        }))
    return {
        'window': [iso(window[0], zone), iso(window[1], zone)],
        'attentionLogBegan': iso(log_began, zone) if log_began else None,
        'fallbackUntil': iso(fallback_until, zone) if fallback_until > window[0] else None,
        'unmatchedFirstPlays': unmatched_plays,
        'threads': [thread for _, thread in sorted(result, key=lambda item: item[0])],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True, help="The environment's userdata/statev2.sqlite")
    parser.add_argument('--start', required=True, type=parse, help='ISO time with offset')
    parser.add_argument('--end', required=True, type=parse, help='ISO time with offset')
    parser.add_argument('--tz', default='America/Toronto', help='Timezone for printed times')
    parser.add_argument('--read-aloud-dir', help="The environment's userdata/read-aloud cache")
    args = parser.parse_args()
    if args.end <= args.start:
        parser.error('--end must be after --start')
    with connect(args.db) as db:
        print(json.dumps(collect(db, (args.start, args.end), ZoneInfo(args.tz), args.read_aloud_dir),
                         indent=2))


if __name__ == '__main__':
    main()
