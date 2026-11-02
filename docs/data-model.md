# Board data model

Everything the pipeline knows lives in the **Job Hunt Board** artifact's private
database: <https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E>. Only the owner can
read or write it (rule: root `read: admin, write: owner`). Claude reads and writes
it with the `ArtifactData` tool; the board page reads and writes the same documents.

**Nothing personal goes into this git repository** (it is public). No CV text,
phone numbers, answers, PDFs or screenshots. Work files go in `/tmp/jobrun/`.

Writing rules for Claude:
- Read before you write. `ArtifactData list` prints each document's `version`;
  pass it as `if_version` on every `update`/`set`/`delete` of an existing document.
  New documents need no version. If a write is refused because the version moved
  (the user tapped something on the board meanwhile), re-read that document and redo it.
- Prefer `update` (merge) over `set` for existing documents, so you never wipe fields
  the board added.
- Append to `history` (`[{status, on: "YYYY-MM-DD"}]`) on every status change, and set
  `updatedAt` (ISO time) on every write.
- Dates are `YYYY-MM-DD` in the user's time zone (`settings/main.timezone`).

## `jobs/{id}` — one per job

`id` comes from `jobpipe` (`docId`): `<company>-<title>-<hash>`, lowercase letters, digits, `-`.

| field | meaning |
|---|---|
| `company`, `role`, `location`, `remote`, `pay`, `department`, `employmentType` | from the posting (`remote`: true / false / "hybrid" / null) |
| `url`, `applyUrl`, `ats`, `source`, `key`, `fingerprint`, `postedAt` | where it came from; `ats` decides how to apply |
| `description` | posting text, up to 6000 characters |
| `status` | see below |
| `fit` | `{score 0-100, verdict: "strong"\|"good"\|"stretch", why, meets: [], gaps: []}` |
| `flags` | `{scam: {risk, reasons}, stale: {stale, reasons}, languageGaps: [], ageDays}` |
| `materials` | `{cv: <tailored resume>, coverLetter: {salutation, paragraphs: [], closing} \| null, answers: [{q, a}], truth: {ok, errors, warnings}, ats: {ok, coverage}, cvPdfUrl?, letterPdfUrl?}` |
| `apply` | `{method: "auto"\|"manual"\|"local", attempts, lastAttempt, result, confirmation, finalUrl, error}` |
| `blocker` | `{kind: "captcha"\|"login"\|"assessment"\|"question"\|"error"\|"video", detail, action, link, deadline?}` |
| `decision` | `{by: "you"\|"auto", at, skipReason?}` — written by the board when the user taps Approve/Skip |
| `contact` | `{name, email, role}` (older documents may hold a string) |
| `appliedOn`, `nextStep`, `nextDate`, `notes` | tracking |
| `prep` | interview prep: `{summary, likelyQuestions: [], storiesToUse: [], askThem: [], logistics}` |
| `emails` | last 10 related emails: `[{at, from, subject, kind}]` |
| `history`, `createdAt`, `updatedAt` | audit trail |

### Status flow

```
found → ready ──(user: Approve)──→ approved → applying → applied → screening → interviewing → offer → accepted
          │                                      │                       ↘ rejected / ghosted / withdrawn
          └─(user: Skip)→ skipped                ├→ manual   (login site: materials ready, apply by hand or /job-apply-local)
                                                 └→ blocked  (captcha, test, missing answer: see blocker.action)
saved = added by hand on the board, not yet processed (the next run scores and tailors it)
```

- `ready` waits for the user. In `auto` mode, jobs at or above `settings.autoThreshold` with
  no flags skip straight to `approved` (`decision.by: "auto"`).
- `manual` and `blocked` always carry `blocker.action`: one plain sentence saying what the user does.

## `profile/main`

```json
{
  "name": "", "email": "", "altEmail": "", "phone": "", "location": "", "nationality": "",
  "links": {"linkedin": "", "website": ""},
  "languages": [{"name": "English", "level": "native"}],
  "workAuth": {"France / EU": "Citizen", "United Kingdom": "...", "United States": "Citizen"},
  "targets": {
    "roles": [], "titleKeywords": [], "excludeKeywords": [], "keywords": [], "searchTerms": [],
    "locations": [], "remoteOk": false, "levels": [], "startDate": "", "minSalary": null,
    "maxAgeDays": 45, "dealBreakers": []
  },
  "savedAnswers": {"gender": "", "ethnicity": "", "disability": "", "veteran": "", "salaryExpectation": "",
                   "noticePeriod": "", "relocation": "", "sponsorship": {}, "howHeard": "", "pronouns": ""},
  "facts": ["confirmed free-text facts usable in letters and answers"],
  "confirmed": {"contact": false, "targets": false, "cv": false},
  "updatedAt": ""
}
```

Nothing is submitted while `confirmed.cv` is false.

## `profile/resume` — the master CV

Shape used by `jobpipe` (`lib/resume.mjs`). Every bullet has a stable `id`; tailored CVs
point back at them with `src`, which is how the truth check works.

```json
{
  "basics": {"name": "", "email": "", "phone": "", "location": "", "nationality": "", "links": []},
  "education": [{"id": "edu-x", "institution": "", "degree": "", "location": "", "start": "2025-09", "end": "2027-06", "grade": "", "details": [{"id": "edu-x-1", "text": ""}]}],
  "work": [{"id": "w-x", "organization": "", "position": "", "location": "", "start": "2025-01", "end": "2025-06", "highlights": [{"id": "w-x-1", "text": ""}]}],
  "activities": [{"id": "a-x", "organization": "", "role": "", "location": "", "start": "", "end": "", "highlights": [{"id": "a-x-1", "text": ""}]}],
  "skills": [{"id": "s-lang", "category": "Languages", "items": []}],
  "interests": [],
  "meta": {"order": ["education", "work", "activities", "skills"], "confirmed": false, "source": "", "unconfirmed": []}
}
```

A **tailored** CV keeps the same entries (`id`, organisation, title, dates and place unchanged),
may drop or reorder entries and bullets, and rewrites bullets as `{text, src: [master bullet ids]}`.

## `profile/stories`

`{items: [{id, title, situation, action, result, skills: [], src: [bullet ids]}]}` — STAR stories
for interviews, built from the CV.

## `settings/main`

| field | default | meaning |
|---|---|---|
| `mode` | `"approve"` | `"auto"`: submit jobs with fit ≥ `autoThreshold` without asking |
| `autoThreshold` | 85 | |
| `dailyLimit` | 5 | most applications submitted per day |
| `readyCap` | 8 | most jobs waiting for approval at once (stops the queue piling up) |
| `minFit` | 65 | lower scores are not shown |
| `paused` | false | stop finding and applying; the inbox is still watched |
| `quietRanges` | `[{from, to, label}]` | exam periods: no notifications, no interview slots offered |
| `timezone` | | IANA name |
| `runTriggerId` | | the daily scheduled task; the board's "Run now" button fires it |
| `lastRun` | | `{at, ok, summary}` |

## `sources/main`

```json
{
  "watchlist": [{"ats": "greenhouse", "slug": "acme", "company": "Acme", "enabled": true, "verified": false, "addedAt": "", "why": ""},
                {"ats": "workday", "host": "x.wd1.myworkdayjobs.com", "tenant": "x", "site": "X_Careers", "company": "X", "search": ["analyst"]}],
  "aggregators": [],
  "searchTerms": [],
  "targetFirms": [{"name": "", "status": "unresolved|found|custom|none", "careersUrl": "", "note": ""}],
  "updatedAt": ""
}
```

## `questions/{id}`

`{text, why, kind: "text"|"long"|"choice"|"confirm", options?, suggested?, answer?, status: "open"|"answered"|"applied", field, jobId?, priority: 1-3, createdAt, answeredAt?}`

`field` says where the answer goes, e.g. `profile/main.targets.locations`, `profile/main.workAuth.United Kingdom`,
`profile/resume.confirm`, `job:<id>:answers`. The board writes `answer` and `status: "answered"`; the next run
applies it and sets `status: "applied"`.

## `digests/{YYYY-MM-DD}`

`{date, headline, needsYou: [{text, jobId?, questionId?, link?, urgent?}], done: [], replies: [{company, role, kind, summary, jobId}], upcoming: [{date, text, jobId?}], stats: {appliedWeek, replyRate, ready, interviews}, errors: [], createdAt}`

## `learning/main`

`{notes: [{at, text}], updatedAt}` — weekly review of what gets replies.
