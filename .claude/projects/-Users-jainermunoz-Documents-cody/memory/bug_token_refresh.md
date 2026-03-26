---
name: Integration tokens lost on server restart
description: HIGH PRIORITY BUG — user has to re-enter all integration tokens (Jira, GitHub, Claude Code) repeatedly
type: feedback
---

Integration tokens need to be re-entered frequently. This happened during validation — all three tokens (Jira, GitHub, Claude Code) stopped working and had to be refreshed in the UI.

**Why:** Likely the encryption key changes between restarts (derived from JWT_SECRET which may vary), or the tokens are being lost/corrupted in the DB. Need to investigate whether the CryptoService encryption key is stable across restarts and whether the encrypted values in the Integration table are intact.

**How to apply:** HIGH PRIORITY. Fix before next validation. Check:
1. Is ENCRYPTION_KEY / JWT_SECRET consistent across restarts?
2. Are encrypted tokens in the DB intact after restart?
3. Test: create integration → restart server → test connection
