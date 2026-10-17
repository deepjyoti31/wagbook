#!/bin/bash
# Runs at the start of every Claude Code session (see .claude/settings.json).
# In a cloud session the repository is a fresh clone with no node_modules, so
# install dependencies. On your own machine this does nothing.
# See docs/11-working-with-claude-code.md.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# A node_modules folder can be there but out of date (a cached container from an
# older commit), so install again whenever package-lock.json has changed since
# the last install here.
stamp=node_modules/.wagbook-lock-sha
want=$(sha256sum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat "$stamp" 2>/dev/null)" != "$want" ]; then
  if npm ci --no-audit --no-fund >/tmp/wagbook-npm-ci.log 2>&1; then
    echo "$want" > "$stamp"
  else
    echo "npm ci failed; see /tmp/wagbook-npm-ci.log"
  fi
fi
exit 0
