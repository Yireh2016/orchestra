---
name: Slack integration pending org approval
description: Slack bot token needs org admin permissions — skip Slack adapter testing for now
type: project
---

Slack integration requires org admin approval for bot token permissions. Skip Slack adapter in testing. Jira, GitHub, and Claude Code tokens are configured and ready.

**Why:** Org policy requires admin approval for Slack app installations.
**How to apply:** When testing phase handlers, use Jira comments as the channel adapter instead of Slack. Revisit Slack when permissions are granted.
