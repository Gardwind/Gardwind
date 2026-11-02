---
description: Build or refresh the profile, master CV, stories and target list
---

# Profile setup / refresh

Extra input from the owner (may be a pasted CV, corrections, new targets): $ARGUMENTS

Board `https://claude.ai/artifact/Xfw1REzTmnqSktXYh6jz8E`. Read `docs/data-model.md` for
document shapes. Load `profile`, `questions`, `sources`, `settings` with `ArtifactData list`
(note versions).

1. **Master CV.** If `profile/resume` is missing or the owner gave a newer CV: take the CV
   (pasted text, or Google Drive — search titles containing CV / resume and use the newest
   real CV, not templates). Convert it to the resume shape with stable ids (`w-<org>`,
   `w-<org>-1`, `edu-<school>`, `a-<org>`, `s-<category>`). Keep wording and numbers exactly
   as written. Anything you had to guess (dates, titles that the source layout scrambled) goes
   in `meta.unconfirmed` as a short list, and `meta.confirmed: false`. Render it once
   (`node jobpipe/bin/jobpipe.mjs cv --resume <file> --out /tmp/jobrun/master.pdf`) to check it fits.
2. **Questions** (`questions/<short-id>`, `status: "open"`), only for things you can't
   find. Always give a `suggested` answer drawn from what you know, so the owner can confirm
   with one tap. Typical set: confirm master CV (`field: "profile/resume.confirm"`, kind
   `confirm`, `why` listing `meta.unconfirmed`), target roles, locations, start date, right to
   work per country, salary expectation, application email (prefer the Gmail inbox Claude can
   read, so replies and codes are seen), anything required by common forms (notice period,
   relocation). Priority 1 = blocks submitting; 2 = improves matching; 3 = nice to have.
3. **Stories.** From the CV build 5–8 STAR stories in `profile/stories` (`src` = bullet ids):
   one per strong bullet cluster — restructuring analysis, investment work, fundraising
   project, competition win, etc. Only facts from the CV.
4. **Targets.** Fill `profile/main.targets` with `titleKeywords` (role words that must appear
   in a title), `keywords` (skills/sector words for ranking), `searchTerms` (for Workday and
   aggregators), `excludeKeywords` (seniority words), `locations`, `levels`.
   Seed `sources/main.targetFirms` from any target list the owner keeps (status `unresolved`).
5. Set `profile/main.confirmed` flags only from the owner's explicit answers.

Never overwrite owner-entered values without saying so in the digest or reply.
