---
name: leaving-pr-comments
description: Use whenever leaving comments on GitHub.
---

# Leaving PR Comments

Prefix every agent-authored comment left on the user's behalf with this GitHub
note callout:

```md
> [!NOTE]
> 🤖 **<model> responding on behalf of <user>**

Actual comment starts here.
```

Use the verified public name of the model that wrote the comment, and the
user's name or GitHub login.

If the harness does not expose a model name, use the harness name. Do not guess.

Before posting, check the entire comment, including quoted text and
attachments, for secrets and private details.

Keep the attribution inside the note and the actual reply outside it. The
context line must start with the robot emoji. Do not add a horizontal rule,
Setext underline, heading, signature footer, or a second attribution.

Apply this format to top-level PR comments, inline review comments, replies to
bots or reviewers, and written explanations used before resolving or
dismissing feedback. Do not add it to PR descriptions, commit messages, or text
the user explicitly asked to post verbatim without attribution.

Write the comment itself in a direct style:

- Lead with the conclusion.
- Cite the relevant code, behavior, check, or reproduction.
- Keep it concise and avoid filler, canned thanks, or status narration.
- Distinguish verified facts from judgment.

Preview the final Markdown before posting so quoting and blank lines render as
shown. After posting, verify that GitHub returned the comment or review URL.
Resolve a review thread only after its response was posted successfully.

## On Jeff's machine

This section is added by the jeff-mods `tstack` plugin and outranks the steps
above where they differ.

- The user is Jeff, GitHub login `Jeff-Kazzee`.
- Every GitHub comment, review reply, or resolve note is an external message
  under Jeff's Approval law, on any repository, private or public. Draft the
  exact text, show it to Jeff with the question tool, and post it only after he
  approves it. Batch several drafts into one question, sized to five minutes.
- Fixing the code a comment points at needs no approval. Only the posted text
  does.
- Jeff's writing law covers the comment body: no em dashes, no semicolons in
  prose, no marketing adjectives.
