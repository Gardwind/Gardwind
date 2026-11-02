---
description: On your laptop — submit the applications that need a logged-in browser (Workday etc.)
---

# Apply from this computer (login sites)

Use this on the owner's own computer in Claude Code, where their browser and saved logins
are. It finishes jobs the cloud run marked `manual` (Workday and other sites that need an
account) and `blocked` jobs whose `blocker.kind` is `captcha` or `login`.

Jobs: $ARGUMENTS — if empty, all `manual` jobs plus those blocked jobs, best fit first.

Setup once: `cd jobpipe && npm install playwright && npx playwright install chromium`.

1. Load the board (`/job-run` step 0.2–0.3). Show the owner the list (company, role, fit,
   why it's blocked) and ask **once**: submit all, choose some, or fill-only (stop before
   Submit). This is the only question; then work through them.
2. Per job: render the CV / letter PDFs (`/job-apply` step c). Open `applyUrl` in the owner's
   browser with the browser tools available here (Claude in Chrome, or the computer-use /
   Playwright tools). Sign in with the browser's saved login; if an account must be created,
   use `profile/main.email`, let the browser suggest a strong password, and read the
   verification email from Gmail.
3. Fill every page from the same sources as `/job-apply` step f (truth rules apply, unknown
   required answers → ask the owner now, since they're here). Upload the PDFs.
4. Submit (if the owner said so) and confirm on the page. CAPTCHAs: let the owner solve them.
5. Update each job on the board exactly as `/job-apply` step g.4 (`apply.method: "local"`).
6. Reply with one line per job.
