---
description: Add one job (URL, pasted posting or screenshot), score and tailor it
---

# Add a job

The job: $ARGUMENTS

1. Load the board (`/job-run` step 0.2–0.3) if not loaded.
2. Get the posting: a URL → `node jobpipe/bin/jobpipe.mjs job --url <url> --out /tmp/jobrun/add.json`.
   Pasted text or a screenshot → build the same fields yourself (company, title, location,
   url if any, description). Check `scam` and `ageDays` in the output.
3. If the same job is already on the board (same company + role + city), update that one instead.
4. Score it (`/job-run` §5) and tailor it (`/job-run` §6), even if below `minFit` — the owner
   asked for it. Say plainly in `fit.why` if it's a stretch.
5. Write it as `status: "ready"`. If the owner said "apply" / "send it", set
   `status: "approved"`, `decision: {by: "you", at}` and run `/job-apply <id>` now.
6. Reply in one or two lines: fit score, the main reason, what happens next.
