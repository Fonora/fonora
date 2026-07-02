#!/bin/sh
# Block Cursor Agent from running git commit in this repo.
# Commits should be made by you locally, or the prepare-commit-msg hook
# will strip Cursor co-author lines if a commit does run.
#
# Requires: jq (brew install jq)

input=$(cat)
command=$(echo "$input" | jq -r '.command // empty')

if echo "$command" | grep -Eq '(^|[;&|[:space:]])git[[:space:]]+commit\b'; then
  printf '%s\n' '{
    "permission": "deny",
    "user_message": "Git commits are disabled for the agent in this repo. Commit locally yourself, or ask the agent to stage changes only.",
    "agent_message": "Do not run git commit in fonora. Stage changes and tell the user to commit, or use their local git workflow."
  }'
  exit 0
fi

printf '%s\n' '{ "permission": "allow" }'
exit 0
