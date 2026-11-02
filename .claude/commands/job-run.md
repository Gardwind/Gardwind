---
description: The daily job-hunt cycle — inbox, submit approved, find, score, tailor, digest
---

# Daily job-hunt run

You are running the owner's job search while they study. Nobody is watching this session:
**never stop to ask in chat.** Anything that needs the owner becomes a `questions` document
or a `needsYou` line in today's digest, then you carry on. Follow `CLAUDE.md` (truth,
consent, privacy). Never commit or push anything.

Constants:
- `BOARD` = `https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E` (every `ArtifactData` call uses this `url`)
- `JP` = `node jobpipe/bin/jobpipe.mjs` (run from the repo root)
- `W` = `/tmp/jobrun` (work folder; create it; delete nothing outside it)

Extra instructions for this run (may be empty): $ARGUMENTS

Keep a running list of what you did, what needs the owner, and errors — step 9 turns it into the digest.

## 0. Prepare (2 minutes)

1. `$JP selftest`. If a check fails, note it under errors and skip steps that need it
   (Chromium → no submitting or PDFs).
   Check which tools this session has. **No Gmail tools** (`mcp__…Gmail…`): skip step 2,
   don't submit to forms that email a verification code (you can't read it), and add one
   needsYou line: "The daily run can't read your Gmail: open your scheduled tasks on claude.ai,
   edit 'Job hunt daily run' and add the Gmail and Google Calendar connectors." **No Google
   Calendar tools**: skip step 0.5 and never propose interview times (draft "I'm flexible, please
   suggest times" instead). **No `ArtifactData` tool**: stop and end with a message saying the
   board can't be reached; there is nothing else useful to do.
2. Load the board into files — one `ArtifactData` `list` per collection with
   `out_dir: /tmp/jobrun/state` and `query.limit: 1000`:
   `settings`, `profile`, `sources`, `questions`, `jobs`, `digests`, `learning`.
   **Note the `version` of every document from the tool output** — you need it as
   `if_version` for every later update. (Files land in `/tmp/jobrun/state/<collection>/<id>.json`.)
3. Read `settings/main.json`, `profile/main.json`, `profile/resume.json`, `sources/main.json`.
   Write the master CV to `$W/master.json` (copy of `profile/resume.json`).
4. Work out **today** in `settings.timezone`, and:
   - `quiet` = today is inside any `settings.quietRanges` (exam weeks)
   - `paused` = `settings.paused`
   - `cvConfirmed` = `profile/main.confirmed.cv === true`
5. Refresh exam dates: search Google Calendar for events titled like `EXAM` / `exam` /
   `assessment` in the next 90 days. For any exam not covered by `quietRanges`, add
   `{from: <exam date − 5 days>, to: <exam date>, label: "<course> exam"}` and save `settings/main`.

## 1. Apply the owner's answers

For each `questions` document with `status: "answered"`:
- Put the answer where its `field` says (`profile/main.<path>`, `profile/resume.confirm`,
  `sources/main.targetFirms`, `job:<id>:answers`, …). Interpret free text sensibly
  (e.g. "London, Paris, HK" → a list). A "yes" to `profile/resume.confirm` sets
  `profile/main.confirmed.cv = true` and `profile/resume.meta.confirmed = true`.
- Corrections to the CV ("the Paris internship ended in June 2023") → edit `profile/resume`
  (keep ids stable; new bullets get new ids).
- Then `update` the question: `status: "applied"`.
- If the answer is unclear, create one follow-up question instead of guessing.

## 2. Inbox — always, even when paused

Search Gmail for mail since `settings.lastRun.at` (or the last 3 days), e.g.
`newer_than:3d -category:promotions -category:social (application OR applying OR interview OR assessment OR unfortunately OR offer OR "next steps" OR candidature OR "thank you for your interest")`
plus `from:<domain>` for each company with status `applied`/`screening`/`interviewing`.

For each relevant message, match it to a job (company name, domain, role) and classify:

| kind | what to do |
|---|---|
| confirmation | add to `job.emails`; status stays `applied` |
| rejection | status `rejected`; note any feedback in `notes` |
| interview invite | status `interviewing`; `nextStep` "Interview — <format, who>", `nextDate`; build `prep` (steps 2–4 of `.claude/commands/job-prep.md`); create a Gmail **draft** reply offering 3 slots in the next 7 days from Google Calendar free time (never on exam days or in `quietRanges`, never clashing with classes); needsYou: "Interview invite from X — reply draft is in Gmail" (urgent) |
| online test / video interview | status `screening`; `blocker {kind: "assessment", detail, link, deadline}`; needsYou with the deadline |
| recruiter message | summarise; Gmail **draft** reply if one is expected; needsYou |
| offer | status `offer`; needsYou (urgent). Never accept or decline. |
| job alert (LinkedIn, Indeed, eFinancialCareers, school careers service…) | collect the posting links for step 4 |
| verification code | ignore here (step 3 handles codes live) |

Keep the last 10 emails per job in `job.emails` as `{at, from, subject, kind}`.

## 3. Submit approved applications

Skip this step if `paused` or `!cvConfirmed` (then add needsYou: "Confirm your master CV
on the Profile tab — nothing is sent until you do").

`remaining = settings.dailyLimit − (jobs whose history has {status: "applied", on: today})`.

Queue, in order: jobs with `status: approved` (oldest `decision.at` first). If
`settings.mode == "auto"`: also `ready` jobs with `fit.score >= settings.autoThreshold`,
`flags.scam.risk == "low"`, no `flags.languageGaps`, `materials.truth.ok` — set
`decision: {by: "auto", at}` on those.

For each job while `remaining > 0`, follow **`.claude/commands/job-apply.md`** (one job at a
time). It ends in exactly one of: `applied`, `manual`, `blocked`, or back to `approved`
with an error noted (transient failure; retry next run, at most 2 attempts total).

## 4. Find new jobs

Skip if `paused`. Skip fetching (but still do discovery) if the number of `ready` jobs is
already ≥ `settings.readyCap` — the owner has enough to look at.

1. Fetch: `$JP fetch --watchlist /tmp/jobrun/state/sources/main.json --profile /tmp/jobrun/state/profile/main.json --existing /tmp/jobrun/state/jobs --out $W/cand.json --limit 40`
   - If every error says "Network policy blocked …": add one digest error "Job sites are
     blocked by this cloud environment's network settings — allow Full network access
     (see JOB_PIPELINE.md)" and rely on email alerts + discovery for today.
   - Keep the watchlist honest (save `sources/main` afterwards): a board that fetched without
     error gets `verified: true`. A board that fails with HTTP 404 (wrong slug or site name)
     gets `enabled: false` and its firm goes back to `status: "unresolved"` so discovery tries
     again. "Network policy blocked" says nothing about the board: leave it as it is.
2. Job-alert links from step 2: for each, `$JP job --url <link> --out $W/alert-<n>.json`. If it's
   LinkedIn/Indeed (not fetchable), WebSearch for the same title + company on the company's
   own careers site and use that URL instead. Add good ones to the candidate list.
3. Discovery (≤ 10 web searches per run):
   - `sources/main.targetFirms` with `status: "unresolved"`: search the job-board hosts
     directly, e.g. `"<firm>" (site:myworkdayjobs.com OR site:greenhouse.io OR site:lever.co OR site:ashbyhq.com OR site:smartrecruiters.com)`;
     plain "<firm> careers" searches mostly return aggregators. Take any board URL you find
     and run `$JP board --url <url>` — it only parses the URL and needs no network. If it
     parses, add it to `watchlist` (`{..., company, enabled: true, verified: false, addedAt,
     why: "target firm"}`) and set the firm `status: "found"`, **even when job sites are
     blocked today** — the next fetch verifies it. Only if the firm has no such board, use
     `status: "custom"` with its own `careersUrl` (step 4.2 handles single postings from such
     sites); if nothing at all, `"none"`.
   - 2–4 searches for open roles, e.g. `site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com "<role>" "<city>"`
     and `site:myworkdayjobs.com "<role>" "<city>"`. New boards → `watchlist`.
   - Save `sources/main` (update with its version).
4. Drop candidates that are scam `high` (already dropped by fetch), stale talent-pool
   listings, roles needing a language at a level the owner lacks (note the count), and
   anything violating `targets.dealBreakers`.

## 5. Score — your judgement

For the best ~15 candidates (by `pre` score), read the posting and score fit 0–100:

| part | points | what earns them |
|---|---|---|
| Role / function | 40 | the work matches `targets.roles` (restructuring, PE/VC, credit, M&A, strategy…) |
| Evidence | 25 | concrete matches to CV bullets — cite them |
| Level & timing | 15 | graduate / analyst / associate level; start date fits `targets.startDate` |
| Place & right to work | 10 | location in `targets.locations`; `profile/main.workAuth` covers it without sponsorship, or the role sponsors |
| Firm & sector | 10 | target firm or sector the owner cares about |

Subtract for: required language gaps (−15 each), visa sponsorship needed but not offered (−20),
more than 2 years' required experience (−15), deal-breakers (exclude).
`verdict`: strong ≥ 80, good 65–79, stretch < 65. `why`: one or two plain sentences naming
the strongest match. `meets` / `gaps`: short phrases.

Keep jobs with `fit.score >= settings.minFit`. Write them as documents:
`$JP stage --candidates $W/cand.json --ids <docId,...> --out-dir $W/new` then add `fit` to
each file (edit the JSON). Alert-email jobs: build the same document shape by hand.

## 6. Tailor

`slots = settings.readyCap − (number of ready jobs)` (max 6 per run). For the top `slots`
scored jobs, best first:

1. **Tailored CV** `$W/t-<id>.json`: start from `$W/master.json`. Keep every entry's `id`,
   organisation, title, place and dates exactly. Choose and reorder bullets for this posting;
   reword them toward its language, each as `{text, src: [master bullet ids]}`. Same numbers,
   no new tools or skills. Optional one-line `summary` (`{text, src}`), facts only.
   Run `$JP cv --resume $W/t-<id>.json --master $W/master.json --out $W/cv-<id>.pdf`.
   Must show `truth.ok: true`, `ats.ok: true`, `pdf.pages: 1`. Fix and rerun until it does
   (cut weaker bullets to fit one page).
2. **Cover letter** (only if the posting or form asks, or it's a small firm / fund):
   `{salutation, paragraphs: [3 short paragraphs], closing}`, ≤ 220 words: why this firm (one
   specific fact from the posting or their site), why you (two matched experiences), close.
   Check: `$JP check-text --master $W/master.json --text "<all paragraphs>" --facts /tmp/jobrun/state/profile/main.json`.
3. **Likely answers** `[{q, a}]`: why this firm / role (≤ 120 words), right to work &
   sponsorship (from `workAuth`), start date, salary expectation (only from `savedAnswers`,
   otherwise "Open to discussion in line with the role's band"), notice period. Check them
   the same way.
4. Put `materials: {cv, coverLetter, answers, truth: {ok, warnings}, ats: {ok, coverage}}`
   into `$W/new/<id>.json`, `status: "ready"` (history entry). In `auto` mode with
   `fit.score >= autoThreshold` and no flags: `status: "approved"`, `decision: {by: "auto", at}`.

Scored-but-not-tailored jobs (no slot): `status: "found"` with `fit` — the next run tailors them first.

Write all new documents in one go: `$JP batch --dir $W/new --collection jobs --out $W/batch.json`,
then one `ArtifactData` `batch` call per chunk with that chunk's `writes`.

## 7. Follow-ups and housekeeping

- `applied` ≥ 10 days, no reply, and a contact email known → Gmail **draft** follow-up
  (3 sentences) + needsYou "Follow-up for X is ready in Gmail drafts". Mark `nextStep` so
  you never draft twice.
- `applied` ≥ 30 days, no reply → `ghosted`.
- `blocked` or `manual` untouched for 21 days → `skipped` with `decision.skipReason: "expired"`.
- `found` older than 14 days → delete.
- Digests older than 30 days → delete.

## 8. Learn (Sundays only)

`$JP stats --jobs /tmp/jobrun/state/jobs --out $W/stats.json`. Append 3–5 plain observations to
`learning/main.notes` (which sources, firms and fit bands get replies; top skip reasons).
Act on clear patterns: skipped ≥ 3 times for the same reason → add to
`targets.excludeKeywords` / `dealBreakers`; boards that returned nothing relevant for 3 weeks →
`enabled: false`. If reply rate < 5% after 30 applications, ask one question proposing a change.

## 9. Digest and wrap-up

1. Write `digests/<today>` (set): `headline` (one sentence, e.g. "3 new jobs to approve, 2
   applications sent, interview invite from X"), `needsYou` (max 5, most urgent first, each
   saying exactly what to tap or do), `done`, `replies`, `upcoming` (next 7 days), `stats`
   (`appliedWeek`, `replyRate`, `ready`, `interviews`), `errors` (plain sentences).
2. `settings/main.lastRun = {at, ok, summary}` (update with its version).
3. Notification — the scheduled task pushes this session's **final message** to the owner's
   phone, so make its first line the thing to act on: "4 jobs to approve · interview invite
   from X — open Job Hunt Board". If nothing needs the owner, start with "Nothing needs you
   today." In `quiet`, keep it to "Nothing needs you today." unless there is an offer or an
   interview deadline within 48 h. (If a `PushNotification` tool exists, you may also send the
   same first line through it.)
4. Final message of this session: that first line, then the digest headline and one line per
   section.
