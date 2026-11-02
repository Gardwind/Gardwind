# Job Application Pipeline — Build Spec for Claude Code

> **How to use this file:** put it in an empty folder on your computer, open Claude Code in that folder, and say:
> **"Read JOB_PIPELINE.md and build it, step by step. Ask me for anything marked FILL IN."**
>
> Goal: Claude runs my job search (find → judge → tailor → apply → track → follow up) so I can spend my time studying. I check in **once a day for ~5 minutes**.

---

## 0. Who I am — FILL IN before first run

Claude: ask me for each of these and save them to `profile/profile.md`. Never guess them.

- Full name, email, phone, city, country
- Work permit / visa status (per country I'd apply in)
- Target roles (e.g. "junior data analyst", "research assistant")
- Target locations + remote / hybrid / on-site preference
- Minimum salary (currency, per month or per year)
- Earliest start date, hours available (I'm studying — part-time? full-time after graduation?)
- Deal-breakers (industries, companies, travel, shift work…)
- Links: LinkedIn, GitHub, portfolio
- My CV → save as `profile/cv-master.md` (and the original PDF in `profile/`)
- 5–10 true stories of things I did (project, result, what I learned) → `profile/stories.md`

**Truth rule (non-negotiable):** every CV line, cover letter and form answer must come from `profile/`. If something is missing, write `[ASK: …]` and put the question in my daily digest. Never invent a skill, grade, metric, employer, date or title.

---

## 1. The cycle

```
        ┌────────── daily, automatic ──────────┐
 FIND → SCORE → TAILOR → (APPROVE) → APPLY → TRACK → WATCH INBOX → FOLLOW UP / PREP
        └──────── me: 5 min/day, approve the batch ────────┘
```

| Step | What Claude does | Output |
|---|---|---|
| **1. Find** | Search the job sources in §3 for my target roles/locations. Skip duplicates (same company + role already tracked). | New rows in tracker, stage `found` |
| **2. Score** | Read each posting; score fit 0–100 against my profile; list must-haves I meet / miss; check deal-breakers, salary, visa. Drop < 50. | `jobs/<company>-<role>/fit.md` |
| **3. Tailor** | For jobs ≥ 70: tailored CV (reorder/rephrase real experience only, keyword-match the posting) + short cover letter + answers to likely form questions. | `jobs/<…>/cv.pdf`, `cover-letter.md`, `answers.md` |
| **4. Approve** | Put the batch in the daily digest. I reply e.g. "approve 1,3,4 · skip 2 · fix 5: …". | Stage `ready` → `approved` |
| **5. Apply** | Open the application page in the browser, fill the form from `profile/` + `answers.md`, upload the tailored CV. Submit per the rules in §4. Screenshot the confirmation page. | Stage `applied`, date, screenshot |
| **6. Track** | Keep the tracker (§5) up to date after every action. | Tracker |
| **7. Watch inbox** | Scan Gmail daily for replies from companies I applied to. Classify: rejection / interview invite / assessment / recruiter question / other. Update stage. | Stage changes + digest items |
| **8. Follow up** | No reply after 10 days → draft a polite follow-up for my approval. Interview invite → draft a reply with my free slots + build an interview prep sheet from the posting and my stories. Rejection → mark `rejected`, note any feedback. | Drafts in digest, `jobs/<…>/interview-prep.md` |

---

## 2. My daily 5 minutes — the digest

Every day at a fixed time, Claude writes `digest/YYYY-MM-DD.md` (and, if Gmail is connected, emails it to me as a **draft I can read**, not sent to anyone else):

1. **Needs you** (top, max 5 items): approvals, `[ASK: …]` questions, interview replies to confirm.
2. **Ready to apply:** table — # · company · role · fit score · why · link to tailored CV.
3. **What happened:** applied today, replies received, stage changes.
4. **Coming up:** interviews, deadlines, follow-ups due.
5. **Numbers:** applied this week, response rate, interviews.

I answer in one message. Claude does the rest.

---

## 3. Job sources

FILL IN which ones I use. Prefer, in this order:

1. Company career pages and ATS job boards (Greenhouse, Lever, Workday, Ashby, SmartRecruiters) — easiest to apply to and least likely to block automation.
2. Job boards that allow it in their terms, via their search pages or RSS/email alerts.
3. Job alert emails already arriving in my Gmail (parse them — no scraping needed).

**Do not** run automated logins or scraping on sites whose terms forbid it (e.g. LinkedIn). For those, only read alert emails and open the "apply on company site" link.

---

## 4. Applying — the rules

- **Approval mode** (setting in `config.yaml`):
  - `review` (default): submit only jobs I approved in the digest.
  - `auto-high-fit`: auto-submit jobs scoring ≥ 85 with no `[ASK]` gaps; everything else waits for approval. Only switch on after I've approved ~20 applications and I'm happy with the quality.
- **Limits:** max 10 applications per day; max 1 role per company per month unless I say so.
- **Personal / sensitive questions** (gender, ethnicity, disability, religion, salary expectations if not in profile): use my saved answer or "prefer not to say" — never guess. If there is no saved answer, stop and ask.
- **Verification codes:** if a site emails a code to my own Gmail, read it from the inbox and enter it. That's fine.
- **CAPTCHAs, ID checks, video/online assessments, anything that wants a password I haven't stored:** don't try to get around them. Leave the job at `blocked` with the link and put it in "Needs you".
- **Never** pay any fee, sign a contract, accept an offer, decline an offer, or send an email to a company without my explicit OK.
- **Never** store my passwords in plain files. Use the browser's saved logins.
- Keep a screenshot of every submitted form in `jobs/<…>/submitted.png`.

---

## 5. Tracker

**Stages:** `found → scored → ready → approved → applied → screening → interviewing → offer → accepted`, plus `rejected`, `ghosted` (no reply after 30 days), `withdrawn`, `skipped`, `blocked`.

**Fields per job:** id, company, role, location, pay, url, source, fit score, stage, applied on, contact, next step, next step date, notes, history (stage + date list).

**Where it lives:**
1. **Primary:** my Job Hunt Board artifact — https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E
   Collection `jobs`, one document per job, fields:
   `company, role, location, pay, url, source, status, appliedOn, contact, nextStep, nextDate, notes, history[{status,on}], createdAt, updatedAt`
   Status values the board shows: `saved, applied, screening, interviewing, offer, rejected, ghosted, withdrawn` (map `found/scored/ready/approved/blocked/skipped` → `saved`, and put the detailed stage + fit score in `notes`).
   Write with the `ArtifactData` tool. Always read the doc first and pass its `version` as `if_version`.
2. **Fallback / backup:** `tracker.csv` in this folder, same fields. If the board isn't reachable from this Claude Code, use only the CSV and tell me.

---

## 6. Folder layout to create

```
job-pipeline/
├── JOB_PIPELINE.md          ← this file
├── CLAUDE.md                ← short rules for every session (truth rule, limits, approval mode)
├── config.yaml              ← roles, locations, salary floor, sources, approval mode, daily limits, digest time
├── profile/                 ← cv-master.md, cv.pdf, profile.md, stories.md, saved-answers.md
├── jobs/<company>-<role>/   ← posting.md, fit.md, cv.pdf, cover-letter.md, answers.md, submitted.png, interview-prep.md
├── digest/YYYY-MM-DD.md
├── tracker.csv
└── scripts/                 ← anything needed (e.g. CV → PDF render)
```

---

## 7. What Claude Code needs connected — set up with me, in this order

1. **Gmail** connector/MCP — read replies + verification codes, create drafts. (Sending only after my OK.)
2. **Browser control** — Claude in Chrome / the Claude desktop app browser, or Playwright MCP — to fill and submit forms with my logged-in browser.
3. **Google Calendar** (optional) — check my free slots for interview replies; add interviews after I confirm.
4. **The Job Hunt Board** via `ArtifactData` (see §5).
5. **A daily schedule** — a scheduled task that runs `/daily-run` every morning (Claude Code scheduled tasks, or cron calling `claude -p "/daily-run"`). Must run on my computer (the browser and logins live there), so the computer must be on and Claude open at that time.

Create these slash commands in `.claude/commands/`:

| Command | Does |
|---|---|
| `/daily-run` | Steps 1–3 and 7–8, then writes the digest |
| `/apply` | Step 5 for everything `approved` |
| `/digest` | Rebuild today's digest only |
| `/add <url or pasted posting>` | Add + score + tailor one job I found myself |
| `/prep <company>` | Interview prep sheet: role summary, likely questions, which of my stories fit, questions to ask them |
| `/status` | One-screen summary of the pipeline |

---

## 8. Build order (Claude: do these one at a time, show me, then continue)

1. Interview me for §0, create `profile/` and `config.yaml`.
2. Create `CLAUDE.md` with the truth rule, §4 rules and the approval mode.
3. Connect Gmail + browser (§7), test each with one harmless read.
4. Build `/add` and test it on one job I paste. Show me fit.md, the tailored CV and cover letter. I give feedback; adjust templates.
5. Build `/apply` and do **one** real application together, watching every step.
6. Build Find (§3), `/daily-run`, `/digest`, inbox watching and follow-ups.
7. Set up the daily schedule. Run it for a week in `review` mode.
8. After a week: show me stats and ask whether to switch to `auto-high-fit`.

---

## 9. Quality bar

- A tailored application should beat a mass-blasted one: 5 good applications/day > 50 generic ones.
- Cover letters: ≤ 200 words, specific to the company (one real reason from the posting or company site), no clichés ("I am writing to express my interest…", "passionate", "fast-paced environment").
- CV: 1 page unless I say otherwise; keywords from the posting only where they truthfully apply.
- Every week, in the Sunday digest: what's working (which sources/roles get replies), and one suggestion to improve.
