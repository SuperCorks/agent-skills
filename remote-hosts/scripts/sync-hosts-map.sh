#!/usr/bin/env bash
# Keep the private hosts.local.md identical on this Mac and a remote host.
# Usage: sync-hosts-map.sh status|push|pull [ssh-host]   (default host: sim.agents.hoptech.ca)
# Run from the Mac. push and pull back up the copy they replace as hosts.local.md.bak-<time>.
set -euo pipefail

command="${1:-status}"
host="${2:-sim.agents.hoptech.ca}"
script_path="$(realpath "${BASH_SOURCE[0]}")"
skill_dir="$(cd "$(dirname "$script_path")/.." && pwd)"
local_link="$skill_dir/hosts.local.md"
local_file="$(realpath "$local_link" 2>/dev/null || echo "$local_link")"
remote_file='.agents/skills/remote-hosts/hosts.local.md'
stamp="$(date +%Y%m%d-%H%M%S)"
ssh_run() { ssh -o BatchMode=yes "$host" "$@"; }
digest() { shasum -a 256 | cut -c1-16; }

local_hash="missing"
[ -f "$local_file" ] && local_hash="$(digest < "$local_file")"
remote_hash="$(ssh_run "test -f $remote_file && sha256sum $remote_file | cut -c1-16 || echo missing")"

case "$command" in
  status)
    echo "local:  $local_hash  $local_file"
    echo "remote: $remote_hash  $host:~/$remote_file"
    if [ "$local_hash" = "$remote_hash" ]; then
      echo "The copies are identical."
    else
      echo "The copies differ. Compare with:"
      echo "  ssh $host cat $remote_file | diff - \"$local_file\""
    fi
    ;;
  push)
    [ -f "$local_file" ] || { echo "No local copy at $local_file" >&2; exit 1; }
    if [ "$local_hash" = "$remote_hash" ]; then echo "Already identical."; exit 0; fi
    ssh_run "mkdir -p \$(dirname $remote_file) && { test ! -f $remote_file || cp -p $remote_file $remote_file.bak-$stamp; } && umask 077 && cat > $remote_file.tmp && mv $remote_file.tmp $remote_file" < "$local_file"
    note=""; [ "$remote_hash" = "missing" ] || note=" (previous remote copy kept as hosts.local.md.bak-$stamp)"
    echo "Pushed to $host:~/$remote_file$note"
    ;;
  pull)
    [ "$remote_hash" != "missing" ] || { echo "No remote copy on $host" >&2; exit 1; }
    if [ "$local_hash" = "$remote_hash" ]; then echo "Already identical."; exit 0; fi
    [ -f "$local_file" ] && cp -p "$local_file" "$local_file.bak-$stamp"
    (umask 077 && ssh_run "cat $remote_file" > "$local_file.tmp" && mv "$local_file.tmp" "$local_file")
    note=""; [ "$local_hash" = "missing" ] || note=" (previous local copy kept as hosts.local.md.bak-$stamp)"
    echo "Pulled into $local_file$note"
    ;;
  *)
    echo "Usage: $(basename "$0") status|push|pull [ssh-host]" >&2
    exit 2
    ;;
esac
