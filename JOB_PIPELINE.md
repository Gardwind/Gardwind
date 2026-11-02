# Job Application Pipeline

Claude runs the job search end to end (find → judge → tailor → apply → track → follow up →
prepare interviews) so the owner can study. The owner taps **Approve / Skip** on a phone and
answers the occasional question. Everything else happens in a daily cloud run.

```
            every morning, in the cloud (no laptop needed)
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ inbox → submit approved → find → score → tailor CV + letter → digest     │
 └──────────────────────────────────────────────────────────────────────────┘
                 ▲                                         │
                 │   Approve / Skip, answer questions      ▼
                 └──────────────  Job Hunt Board (phone)  ◄┘
```

## What lives where

| Thing | Where |
|---|---|
| All state, CV, answers, settings, the approve buttons | **Job Hunt Board** (private artifact): https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E |
| Rules every Claude session follows | [`CLAUDE.md`](CLAUDE.md) |
| The daily cycle, step by step | [`.claude/commands/job-run.md`](.claude/commands/job-run.md) |
| Submitting one application | [`.claude/commands/job-apply.md`](.claude/commands/job-apply.md) |
| Engine (fetch, filter, scam check, CV PDF, truth check, form filling) | [`jobpipe/`](jobpipe/) — `node jobpipe/bin/jobpipe.mjs help` |
| Board data model | [`docs/data-model.md`](docs/data-model.md) |
| Board page source | [`board/job-hunt-board.html`](board/job-hunt-board.html) |

This repository is public, so it holds **code only**. CVs, answers, PDFs and screenshots stay
on the private board or in temporary folders.

## The daily run

A scheduled task wakes a dedicated **runner** Claude Code session every morning. It is a normal
session, so it has the account's Gmail and Google Calendar connectors (sessions that scheduled
tasks start from scratch don't get connectors). It refreshes this repo, then follows `job-run.md`:

1. **Inbox** — reads replies; marks rejections, interview invites, online tests and offers;
   drafts (never sends) replies; builds interview prep; picks up job-alert emails.
2. **Submit** what was approved: renders a one-page tailored CV PDF, checks it against the master
   CV, opens the application form in a headless browser, fills it, uploads the CV, submits, and
   reads the email verification code from Gmail if the site sends one.
   Sites that need an account (Workday, LinkedIn…) become **Apply by hand** with everything
   prepared, or are finished from a laptop with `/job-apply-local`.
   In the first real run (Nov 2026) most firms' sites needed an account or stopped the cloud
   browser (Greenhouse's email security code never arrived; SmartRecruiters blocked access),
   so expect most applications to arrive as **Apply by hand** cards: tailored CV PDF, letter
   PDF, answers and the link, about 3–10 minutes each from a phone or laptop.
3. **Find** — checks the careers boards of the watched firms (Greenhouse, Lever, Ashby, Workday,
   SmartRecruiters, Recruitee, Personio), finds new firms' boards by probing those systems
   (`jobpipe probe`, `probe-workday`) and by web search, and checks sample postings before
   adding a board. Drops
   duplicates, senior roles, wrong cities, old postings, scams and roles needing a language the
   owner lacks.
4. **Score** each new job 0–100 with a one-line reason.
5. **Tailor** the CV, cover letter and likely form answers for the best ones and put them on the
   board as **Ready to approve**.
6. **Follow up / tidy** — follow-up drafts after 10 days, "no reply" after 30.
7. **Learn** (Sundays) — which sources and firms answer; adjusts filters.
8. **Digest** — one summary on the board and one phone notification when something needs you.

## Safety rules (from `CLAUDE.md`)

- **Truth:** a tailored CV may reorder, cut and reword the master CV, nothing else. The engine
  rejects new employers, changed titles or dates, new numbers, and tools or skills the master CV
  never mentions. Unknown answers become questions instead of guesses.
- **Consent:** nothing is submitted without Approve (or, if switched on in Settings, automatic
  sending of strong matches ≥ 85 with no warnings). No offers accepted or declined, no emails
  sent, no payments, ever.
- **No workarounds:** CAPTCHAs, tests, video interviews and logins go to the owner.
- **Limits:** 5 applications a day by default, one role per company per month, no duplicates.
- **Quiet weeks:** during exam weeks (from the calendar) there are no notifications and no
  interview slots offered.

## One-time setup

1. **Answer the questions on the board** (Today tab) — most have a suggested answer: one tap each.
   Confirm the master CV on the Profile tab. Nothing is sent before that.
2. **Allow job sites in the cloud environment.** In Claude Code on the web, open the
   environment's settings (environment menu → Edit → Network access) and choose **Full**.
   With the default limited access the run can't reach careers sites.
   Docs: https://code.claude.com/docs/en/cloud-environments#network-access
3. *(Optional)* Job alerts on LinkedIn / eFinancialCareers sent to the Gmail address the
   pipeline reads: more coverage at no effort.
4. *(Optional, laptop)* For Workday-type sites: clone this repo, then in `jobpipe/` run
   `npm install playwright && npx playwright install chromium`, and use `/job-apply-local` in
   Claude Code with the Chrome extension.

## Commands (in any Claude Code session in this repo)

| Command | Does |
|---|---|
| `/job-run` | the full daily cycle now |
| `/job-apply [ids]` | submit approved applications |
| `/job-inbox` | check Gmail for replies now |
| `/job-add <url or text>` | add, score and tailor one job |
| `/job-prep <company>` | interview prep |
| `/job-status` | one-screen summary |
| `/job-setup` | rebuild profile / master CV / stories |
| `/job-apply-local` | (laptop) finish login-only applications in your browser |

## Engine checks

```bash
cd jobpipe && npm test
```

```bash
node jobpipe/bin/jobpipe.mjs selftest
```

## Costs and limits

- Each daily run is one Claude Code cloud session and counts toward the plan's usage.
- Postings that only exist behind a login (LinkedIn Easy Apply, most bank portals) can't be
  submitted from the cloud. They're prepared and flagged.
- Online tests, video interviews and CAPTCHAs always need the owner.
