#!/bin/bash
# Runs at the start of every Claude Code session (see .claude/settings.json).
# In a cloud session the repository is a fresh clone with no node_modules, so
# install dependencies. On your own machine this does nothing.
# See docs/11-working-with-claude-code.md.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/tmp/wagbook-npm-ci.log 2>&1 || echo "npm ci failed; see /tmp/wagbook-npm-ci.log"
fi
exit 0
