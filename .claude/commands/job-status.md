---
description: One-screen summary of the job search
---

# Status

Load `jobs`, `digests`, `settings` from the board (`ArtifactData list`). Reply with:

1. Needs you (from today's digest + `blocked`/`manual` jobs + open `questions`), most urgent first.
2. Waiting for your approval: count + top 3 by fit (company, role, score).
3. In progress: applied / screening / interviewing / offer counts; anything with a date in the next 7 days.
4. This week: applied, replies, reply rate (`node jobpipe/bin/jobpipe.mjs stats --jobs /tmp/jobrun/state/jobs`).
5. Last run: `settings.lastRun` (time, ok, summary) and whether the daily run is paused or quiet.

Keep it under 15 lines. $ARGUMENTS
