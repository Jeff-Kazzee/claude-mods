#!/bin/sh
# Copy the workflow and tstack skills to a Linux host, so agents there load the same text as
# the laptop. It carries bytes, not credentials, so it works on a host with no GitHub login.
# The laptop loads these through plugins, so never point this at the laptop.
#
#   scripts/send-skills.sh <git rev> <command that runs a shell command on the host>
#   scripts/send-skills.sh origin/dev ssh linveo-16gb
#
# Installs to ~/.local/share/jeff-skills and links each skill into ~/.agents/skills (Codex)
# and ~/.claude/skills (Claude Code). A real file in the way is reported and kept. Rerun to
# update. Prints the sha256 of the tar on both sides and fails when they differ.
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: scripts/send-skills.sh <git rev> <command...>" >&2
  exit 2
fi

rev=$(git rev-parse --verify "$1^{commit}")
shift

tar=$(mktemp)
trap 'rm -f "$tar"' EXIT
git archive --format=tar "$rev" plugins/workflow/skills plugins/tstack/skills > "$tar"
want=$(sha256sum "$tar" | cut -d' ' -f1)

remote='
set -eu
d=$HOME/.local/share/jeff-skills
t=$(mktemp)
cat > "$t"
sha256sum "$t" | cut -d" " -f1
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
    if [ -e "$l" ] && [ ! -L "$l" ]; then
      echo "kept $l, a real file is in the way"
    else
      ln -sfn "$s" "$l"
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
