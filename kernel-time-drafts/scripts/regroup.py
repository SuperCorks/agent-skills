#!/usr/bin/env python3
"""Plan or verify one local day's Kernel draft grouping; never calls the API."""

import argparse
from collections import defaultdict
from datetime import date, datetime, time, timedelta
import json
from pathlib import Path
from zoneinfo import ZoneInfo


def read(path):
    value = json.loads(Path(path).read_text())
    return value.get('data', value)


def instant(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.utcoffset() is None:
        raise ValueError('Timestamp needs an explicit offset')
    return result


def local_date(entry, zone):
    return instant(entry['startedAt']).astimezone(zone).date()


def make_plan(draft, selected, minimum):
    if draft['status'] != 'open':
        raise ValueError('Draft must be open')
    zone = ZoneInfo(draft['timezone'])
    groups = defaultdict(list)
    for entry in draft['entries']:
        if not entry.get('removedAt') and local_date(entry, zone) == selected:
            groups[(entry['taskRef'], entry['billable'])].append(entry)
    operations = []
    for (task_ref, billable), entries in groups.items():
        entries.sort(key=lambda e: (instant(e['startedAt']), e['ref']))
        minutes = sum(e['durationMinutes'] for e in entries)
        duration = max(minimum, minutes)
        first = datetime.combine(selected, time(), zone).timestamp()
        last = datetime.combine(selected + timedelta(days=1), time(), zone).timestamp()
        if duration > 1440 or duration * 60 > last - first:
            raise ValueError(f'{task_ref}: total cannot fit in one valid daily block')
        centre = sum((instant(e['startedAt']).timestamp() + e['durationMinutes'] * 30)
                     * e['durationMinutes'] for e in entries) / minutes
        start = max(first, min(round((centre - duration * 30) / 900) * 900, last - duration * 60))
        notes = list(dict.fromkeys(e['note'] for e in entries if e.get('note')))
        note = f'{selected}: consolidated {len(entries)} fragments into one estimated {duration}-minute block.'
        if duration > minutes:
            note += f' Applied the {minimum}-minute minimum to the original {minutes} minutes.'
        note += (' Placement is approximate; work was spread across the day and may overlap other tasks.'
                 '\n\nOriginal notes and sources (previous interval descriptions are historical):\n')
        note += '\n\n'.join(notes)
        if len(note) > 50000:
            raise ValueError(f'{task_ref}: notes exceed 50,000 characters; consolidate manually')
        operations.append({'taskRef': task_ref, 'billable': billable, 'keep': entries[0]['ref'],
                           'remove': [e['ref'] for e in entries[1:]], 'originalMinutes': minutes,
                           'patch': {'startedAt': datetime.fromtimestamp(start, zone).isoformat(),
                                     'durationMinutes': duration, 'note': note}})
    before = sum(o['originalMinutes'] for o in operations)
    after = sum(o['patch']['durationMinutes'] for o in operations)
    return {'draftId': draft['id'], 'sourceVersion': draft['version'], 'date': str(selected),
            'timezone': draft['timezone'], 'minimumMinutes': minimum,
            'summary': {'beforeBlocks': sum(1 + len(o['remove']) for o in operations),
                        'afterBlocks': len(operations), 'beforeMinutes': before,
                        'afterMinutes': after, 'addedMinutes': after - before}, 'operations': operations}


def verify(before, after, plan, selected, minimum):
    if (plan['draftId'] != before['id'] or plan['sourceVersion'] != before['version']
            or plan['date'] != str(selected) or plan['minimumMinutes'] != minimum
            or plan['timezone'] != before['timezone']):
        raise ValueError('Plan does not match the source snapshot and requested scope')
    if after['id'] != before['id'] or after['status'] != 'open':
        raise ValueError('Draft identity or status changed')
    if any(after[k] != before[k] for k in ('timezone', 'startsOn', 'endsOn', 'name', 'tasks')):
        raise ValueError('Draft metadata or task definitions changed')
    zone = ZoneInfo(before['timezone'])
    others = lambda d: {e['ref']: e for e in d['entries'] if local_date(e, zone) != selected}
    if others(before) != others(after):
        raise ValueError('Entries on other dates changed')
    old = {e['ref']: e for e in before['entries']}
    new = {e['ref']: e for e in after['entries']}
    active = {e['ref'] for e in after['entries'] if not e.get('removedAt') and local_date(e, zone) == selected}
    if active != {o['keep'] for o in plan['operations']}:
        raise ValueError('Unexpected active entries on selected date')
    covered = []
    for op in plan['operations']:
        entry = new[op['keep']]
        covered.extend([op['keep'], *op['remove']])
        if entry['id'] != old[op['keep']]['id']:
            raise ValueError('Retained entry identity changed')
        if any(entry[k] != old[op['keep']][k] or entry[k] != op[k] for k in ('taskRef', 'billable')):
            raise ValueError('Task assignment or billing changed')
        if any(old[r]['taskRef'] != op['taskRef'] or old[r]['billable'] != op['billable'] for r in op['remove']):
            raise ValueError('Plan merges different tasks or billing settings')
        patch = op['patch']
        if (instant(entry['startedAt']) != instant(patch['startedAt'])
                or entry['durationMinutes'] != patch['durationMinutes'] or entry['note'] != patch['note']
                or entry['durationMinutes'] < minimum):
            raise ValueError('Retained block differs from the plan or minimum')
        end = instant(entry['startedAt']) + timedelta(minutes=entry['durationMinutes'])
        boundary = datetime.combine(selected + timedelta(days=1), time(), zone)
        if end > boundary:
            raise ValueError('Block exceeds selected local date')
        if any(not new[r].get('removedAt') for r in op['remove']):
            raise ValueError('A redundant fragment remains active')
    expected = {e['ref'] for e in before['entries'] if not e.get('removedAt') and local_date(e, zone) == selected}
    if set(covered) != expected or len(set(covered)) != len(covered):
        raise ValueError('Plan does not cover each original fragment exactly once')
    for ref, entry in old.items():
        if entry.get('removedAt') and new.get(ref) != entry:
            raise ValueError('Previously removed entry changed')
    actual = sum(new[r]['durationMinutes'] for r in active)
    if actual != plan['summary']['afterMinutes']:
        raise ValueError('Total differs from plan')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('before')
    parser.add_argument('--date', required=True, type=date.fromisoformat)
    parser.add_argument('--minimum', default=15, type=int)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--out')
    action.add_argument('--verify', metavar='AFTER_SNAPSHOT')
    parser.add_argument('--plan', help='Exact applied plan, required with --verify')
    args = parser.parse_args()
    if not 1 <= args.minimum <= 1440 or (args.verify and not args.plan):
        parser.error('Use a minimum of 1–1440, and supply --plan with --verify')
    try:
        before = read(args.before)
        if args.verify:
            plan = json.loads(Path(args.plan).read_text())
            verify(before, read(args.verify), plan, args.date, args.minimum)
            print('Verified:', json.dumps(plan['summary']))
        else:
            plan = make_plan(before, args.date, args.minimum)
            with Path(args.out).open('x') as output:
                json.dump(plan, output, indent=2)
            print(json.dumps(plan['summary']))
    except (ValueError, KeyError, OSError) as error:
        parser.exit(1, f'Error: {error}\n')


if __name__ == '__main__':
    main()
