---
description: Submit approved applications (all, or the job ids given)
---

# Submit applications

Jobs to submit: $ARGUMENTS — if empty, every job with `status: approved` (oldest
`decision.at` first), up to `settings.dailyLimit` minus today's submissions.

Board `https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E`, engine `node jobpipe/bin/jobpipe.mjs`
(`JP`), work folder `/tmp/jobrun/apply/<id>/` (`D`). If the board isn't loaded in
`/tmp/jobrun/state` yet, do step 0.2–0.3 of `/job-run` first. Follow `CLAUDE.md`. Never
ask in chat when running unattended — record blockers on the board.

## Per job

**a. Lock.** `update` the job: `status: "applying"`, `apply.attempts += 1`, `apply.lastAttempt`
(with `if_version`). If `apply.attempts > 2` → `blocked` with `blocker {kind: "error", detail:
<last error>, action: "Apply by hand — CV and answers are on the card"}` and stop.

**b. Safety checks.** Skip (back to `ready`, needsYou) if: `profile/main.confirmed.cv` is not
true; `flags.scam.risk != "low"` and the owner did not approve after seeing it; the company
already got an application from you in the last 30 days (unless approved anyway).
If `apply.result` was `unconfirmed` on an earlier attempt: search Gmail for a confirmation
from that company first — if one exists, mark `applied` and stop (never submit twice).

**c. Documents.** Write `D/tailored.json` (= `materials.cv`) and run
`$JP cv --resume D/tailored.json --master /tmp/jobrun/master.json --out D/<Firstname>_<Lastname>_CV.pdf`.
Require `truth.ok`, `ats.ok`, one page. If the form takes a cover letter and
`materials.coverLetter` exists: write `D/letter.json` (add `company`, `date`, `subject`:
"Application for <role>") and `$JP letter --letter D/letter.json --master /tmp/jobrun/master.json --out D/<Firstname>_<Lastname>_Cover_Letter.pdf`.
Use the real name from `profile/main.name` in file names.

**d. Can it be done here?** By `job.ats`:
- `greenhouse`, `lever`, `ashby`, `smartrecruiters`, `recruitee`, `personio`, or an `other`
  page whose form needs no login → continue.
- `workday`, `taleo`, `successfactors`, `icims`, `oleeo` (`*.tal.net`), `cornerstone`
  (`*.csod.com`), LinkedIn, or `form-inspect` reports
  `login: true` → `status: "manual"`, `apply.method: "manual"`, `blocker {kind: "login",
  action: "Needs an account on the firm's site. Run /job-apply-local on your laptop, or apply
  yourself — CV, letter and answers are ready on this card", link: applyUrl}`. Upload the PDFs
  for the owner (step h) and stop.

What works from the cloud (tested 3–5 Nov 2026):
- **Greenhouse:** after Submit it asks for an 8-digit email security code. The code arrives
  in Gmail within ~20 seconds from `no-reply@us.greenhouse-mail.io`, subject "Security code
  for your application to <Company>". Search exactly
  `from:no-reply@us.greenhouse-mail.io subject:"security code" newer_than:1d`, take the newest
  message dated after the submission started (read the code from the snippet) and write it to
  `D/code.txt`. Five Greenhouse applications went through this way on 5 Nov.
- **Teamtailor** (Indefi) and **50skills** (Stifel) forms submit normally.
- **Recruitee** showed an hCaptcha picture challenge after Send, so it is `manual`.
- **SmartRecruiters** answers "Access is temporarily restricted" → `manual`.
- **Workday, Oleeo (tal.net), Oracle, Cornerstone** need an account → `manual`.
Never solve or get around a challenge; stop and make the job `manual` with the PDFs (step h).

**e. Inspect.** `$JP form-inspect --url <applyUrl> --out D/fields.json --shot D/form.png`
(Lever: `applyUrl` ends in `/apply`; Ashby: `/application`). Read `fields.json`: every field,
its label, kind, options, required flag; plus `captcha` and `login`.

**f. Plan.** Write `D/plan.json`:
```json
{"url": "<applyUrl>", "fields": [
  {"selector": "#first_name", "action": "fill", "value": "…", "label": "First Name"},
  {"selector": "#resume", "action": "upload", "value": "<Firstname>_<Lastname>_CV.pdf", "label": "Resume"},
  {"selector": "#country", "action": "select", "value": "France", "label": "Country"},
  {"selector": "input[name=\"sponsorship\"][value=\"no\"]", "action": "check", "label": "Sponsorship"},
  {"selector": "#location", "action": "combobox", "value": "Shanghai", "optionText": "Shanghai, China", "label": "Location"}
]}
```
(`upload` paths are relative to `plan.json`; radio buttons: `check` the option's own
selector from `options[].selector`.)
Where answers come from:
- Name, email (`profile/main.email` — the inbox Claude can read), phone, location, links → `profile/main`.
- CV / cover letter uploads → the PDFs from step c. A cover-letter text box → the letter text.
- Right to work, sponsorship, relocation, notice period, start date, salary, "how did you
  hear" → `profile/main.workAuth`, `savedAnswers.sponsorship`, `targets.startDate`, `savedAnswers`.
- Expected graduation date → `savedAnswers.graduation` (the same year the tailored CV shows). Salary only from
  `savedAnswers.salaryExpectation`; if a required salary field has no saved answer, ask.
- Diversity / EEO questions → `savedAnswers` if set, otherwise the option meaning "Prefer
  not to say" / "Decline to self-identify".
- Free-text questions → `materials.answers` if one fits; otherwise write a short answer
  from the CV, `facts` and `profile/stories`, then
  `$JP check-text --master /tmp/jobrun/master.json --text "<answer>" --facts /tmp/jobrun/state/profile/main.json` must pass.
- Optional fields you have no fact for → leave empty.
- **A required question you cannot answer truthfully** → create a `questions` document
  (`field: "job:<id>:answers"`, `jobId`, the exact question, `suggested` if you have a
  reasonable draft), set the job `blocked` with `blocker {kind: "question", action: "Answer
  the question on the Today tab"}`, and stop. The next run picks the answer up.

**g. Dry run, then submit.**
1. `$JP form-fill --plan D/plan.json --shots D/shots --out D/dry.json` → must be
   `dry_run_ok`. If `dry_run_incomplete`, fix the plan from `missingRequired` / `failed`
   (look at `D/shots/filled.png` if unclear) and retry, at most twice.
2. If `fields.json` showed a visible CAPTCHA widget that needs solving (not invisible
   reCAPTCHA v3), don't submit: `blocked`, `blocker {kind: "captcha", action: "Open the link
   and press Submit yourself — use the CV and answers on this card", link}`. Upload PDFs (h).
3. Submit, in the background so you can fetch a verification code:
   `$JP form-fill --plan D/plan.json --submit --shots D/shots --code-file D/code.txt --code-timeout 300 --out D/result.json`
   While it runs, watch for `D/shots/needs_code.json` (it appears within ~30 s). Then search
   Gmail as described above (Greenhouse) or for the newest message from that company or ATS
   from the last 15 minutes containing a code, and write just the code to `D/code.txt`. The
   form waits up to `--code-timeout` seconds; the run must not end before `D/result.json` exists.
4. Read `D/result.json` → `status`:
   - `submitted` → job `status: "applied"`, `appliedOn: today`, `apply {method: "auto",
     result: "submitted", confirmation: <first 200 chars of pageText>, finalUrl}`, `nextStep:
     "Wait for reply — follow up if nothing"`, `nextDate: today + 10 days`, history.
   - `captcha` → `blocked` as in g.2.
   - `login_required` → `manual` as in d.
   - `needs_code` / `code_timeout` → `manual {kind: "captcha", action: "The site asked for an
     email code that never arrived, so it was not sent. Open the link, upload the two PDFs below
     and use the answers on this card"}`. Search Gmail for a confirmation before any retry.
   - `error` / `unconfirmed` → look at `D/shots/after-submit.png` and `errors`. If clearly
     not submitted (validation errors), fix the plan and retry once now. If unsure, set
     `apply.result: "unconfirmed"` and back to `approved`; the next run checks Gmail before any retry.

**h. PDFs for the owner** (manual / blocked only): upload the CV and letter PDFs to the
board's asset store — `Artifact` publish with `url: <BOARD>`, `asset: true`, `file_path`
(read the artifact once first if this session hasn't) — and store the returned urls as
`materials.cvPdfUrl` / `materials.letterPdfUrl` so they can be opened from the phone.

Record every outcome for the digest.
