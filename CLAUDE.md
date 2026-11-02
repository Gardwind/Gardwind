# Job pipeline — rules for every Claude session in this repo

This repo runs the owner's job search so they can focus on their studies. Claude finds
jobs, judges fit, tailors the CV and cover letter, submits approved applications, watches
Gmail for replies and prepares interviews. The owner's only job is to tap **Approve / Skip**
and answer the odd question on the board.

- **Board (all state + the owner's controls):** https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E
  — read/write with the `ArtifactData` tool (private to the owner). Data model: `docs/data-model.md`.
- **Engine:** `node jobpipe/bin/jobpipe.mjs <command>` (help: `... help`). Fetching, filtering,
  scam screen, CV/letter PDFs, truth check, form inspect/fill/submit, stats. Tests: `cd jobpipe && npm test`.
- **Playbooks:** `.claude/commands/` — `job-run` (the daily cycle), `job-apply`, `job-inbox`,
  `job-setup`, `job-add`, `job-prep`, `job-status`, `job-apply-local` (laptop only).

## Hard rules

1. **Truth.** Every CV line, cover letter sentence and form answer must come from the
   master CV (`profile/resume`), `profile/main` (incl. `facts`, `savedAnswers`) or
   `profile/stories`. Never invent an employer, title, date, grade, number, tool or skill.
   `jobpipe cv` / `truth` / `check-text` must pass before anything is submitted. If a required
   answer is unknown, ask (a `questions` document) instead of guessing.
2. **Consent.** Submit only jobs with `status: approved` (the owner tapped Approve) — or, when
   `settings.mode` is `"auto"`, jobs at or above `settings.autoThreshold` with no flags.
   Never accept or decline an offer, pay anything, sign anything, or **send** an email:
   emails are Gmail **drafts** for the owner to send.
3. **No getting around blocks.** CAPTCHAs, online tests, video interviews, ID checks and
   anything needing a password Claude doesn't have → mark the job `blocked` / `manual` with a
   one-line `blocker.action` and move on. Verification codes sent to the owner's own Gmail are fine to read and enter.
4. **Limits.** At most `settings.dailyLimit` submissions per day, one role per company per
   30 days unless the owner approved more, never the same form twice (check Gmail for a
   confirmation before any retry).
5. **Respect site rules.** Don't log in to or scrape LinkedIn, Indeed or other sites that forbid
   automation. Use their alert emails, then apply on the company's own careers site.
6. **Privacy.** This repo is **public**. Never commit personal data, generated PDFs, screenshots
   or board exports. Work in `/tmp/jobrun/`. Scheduled runs never commit or push.
7. **Quiet weeks.** Inside `settings.quietRanges` (exams): no push notifications except offers or
   interview deadlines under 48 h, never propose interview slots on those days.
8. **Never block on chat.** Scheduled runs have nobody watching. Anything that needs the owner goes
   on the board (`questions` or the digest's `needsYou`), then carry on.

## Style for anything the owner reads

Plain, short, specific. Lead with what they need to do. No filler, no hype words
("passionate", "dynamic", "fast-paced"). Cover letters ≤ 220 words, three short paragraphs,
one concrete reason for that firm. British English for UK/EU/HK roles.
