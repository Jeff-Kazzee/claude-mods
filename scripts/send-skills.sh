#!/bin/sh
# Copy the workflow, github and tstack skills to a Linux host, so agents there load the same text as
# the laptop. It carries bytes, not credentials, so it works on a host with no GitHub login.
# The laptop loads these through plugins, so never point this at the laptop.
#
#   scripts/send-skills.sh <git rev> <command that runs a shell command on the host>
#   scripts/send-skills.sh origin/dev ssh linveo-16gb
#
# Installs to ~/.local/share/jeff-skills and links each skill into ~/.agents/skills (Codex)
# and ~/.claude/skills (Claude Code). Anything in a link's way that this script did not make
# is reported and kept. Rerun to update. The host checks the tar's sha256 before it touches
# the old install, so a damaged transfer leaves that install as it was.
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: scripts/send-skills.sh <git rev> <command...>" >&2
  exit 2
fi

rev=$(git rev-parse --verify "$1^{commit}")
shift

tar=$(mktemp)
trap 'rm -f "$tar"' EXIT
git archive --format=tar "$rev" plugins/workflow/skills plugins/github/skills plugins/tstack/skills > "$tar"
want=$(sha256sum "$tar" | cut -d' ' -f1)
case "$want" in
  ????????????????????????????????????????????????????????????????) ;;
  *) echo "no sha256 for the tar, so nothing was sent" >&2; exit 1 ;;
esac

remote='
set -eu
case "${HOME:-}" in
  /?*) ;;
  *) echo "HOME must be an absolute path below /" >&2; exit 1 ;;
esac
d=$HOME/.local/share/jeff-skills
t=$(mktemp)
trap '"'"'rm -f "$t"; rm -rf "$d.new"'"'"' EXIT
cat > "$t"
got=$(sha256sum "$t" | cut -d" " -f1)
if [ "$got" != "'"$want"'" ]; then
  echo "hash mismatch: got $got, old install unchanged" >&2
  exit 1
fi
echo "$got"
rm -rf "$d.new"
mkdir -p "$d.new"
tar -xf "$t" -C "$d.new"
rm -f "$t"
echo '"$rev"' > "$d.new/REV"
rm -rf "$d"
mv "$d.new" "$d"
for r in .agents/skills .claude/skills; do
  mkdir -p "$HOME/$r"
  for l in "$HOME/$r"/*; do
    if [ -L "$l" ] && [ ! -e "$l" ]; then
      case "$(readlink "$l")" in "$d"/*) rm -f "$l" ;; esac
    fi
  done
  for s in "$d"/plugins/*/skills/*; do
    l=$HOME/$r/$(basename "$s")
    if [ -L "$l" ]; then
      case "$(readlink "$l")" in
        "$d"/*) ln -sfn "$s" "$l" ;;
        *) echo "kept $l, it links somewhere else" ;;
      esac
    elif [ -e "$l" ]; then
      echo "kept $l, a real file is in the way"
    else
      ln -s "$s" "$l"
    fi
  done
done
'

got=$("$@" "$remote" < "$tar")
printf '%s\n' "$got"
case "$got" in
  "$want"*) echo "ok: $rev, sha256 $want" ;;
  *) echo "hash mismatch: sent $want" >&2; exit 1 ;;
esac
