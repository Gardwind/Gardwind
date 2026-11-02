// Fake-job / scam screen. Each signal adds weight; Claude still makes the final
// call, but anything rated "high" is never shown for approval.
const SIGNALS = [
  { w: 5, re: /\b(telegram|whats\s?app|wechat|signal app|line app)\b[^.\n]{0,60}\b(contact|message|reach|add|interview|apply|hr|recruiter)\b|\b(contact|message|add|reach)\b[^.\n]{0,40}\b(telegram|whats\s?app|wechat)\b/i, why: 'Asks you to move to Telegram/WhatsApp/WeChat' },
  { w: 6, re: /\b(registration|training|processing|application|onboarding|starter|visa|admin(istration)?)\s+fees?\b|\bpay\b[^.\n]{0,30}\b(upfront|in advance|for (your )?training|for equipment|deposit)\b|\brefundable deposit\b/i, why: 'Mentions a fee or deposit you would pay' },
  { w: 5, re: /\b(bitcoin|btc|usdt|crypto ?currency|gift ?cards?|western union|moneygram)\b/i, why: 'Mentions crypto, gift cards or money transfer services' },
  { w: 6, re: /\b(reship(ping)?|package forwarding|parcel forwarding|mystery shopper|check cashing|cash(ing)? cheques?|money mule|receive payments? (on behalf|for us))\b/i, why: 'Classic reshipping / money-handling scam wording' },
  { w: 5, re: /\b(send|provide|upload)\b[^.\n]{0,40}\b(passport|bank (account )?details|credit card|national id|id card copy|social security|ic number|nric)\b/i, why: 'Asks for ID or bank details up front' },
  { w: 3, re: /\b(earn|make)\b[^.\n]{0,25}(\$|£|€|usd|rm|myr|rmb|¥)\s?\d[\d,.]*\s*(\+\s*)?(per|a|\/)\s*(day|hour|week)\b/i, why: 'Promises specific daily/weekly earnings' },
  { w: 3, re: /\bno (prior )?experience (needed|required|necessary)\b[^.\n]{0,80}\b(high|huge|excellent|great) (pay|income|salary|earnings)\b/i, why: '“No experience” plus unusually high pay' },
  { w: 2, re: /[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|qq|163|126|proton(mail)?|aol|icloud|mail)\.(com|net|me|cn)\b/i, why: 'Recruiter uses a free personal email address' },
  { w: 2, re: /\b(work from home|wfh)\b[^.\n]{0,60}\b(data entry|typing|copy ?paste|like and share|liking posts|app reviews?)\b/i, why: 'Work-from-home data entry / task wording' },
  { w: 1, re: /\b(immediate(ly)? start|urgent(ly)? hiring|limited (slots|positions)|act now|apply within 24 hours)\b/i, why: 'Pressure to act immediately' },
  { w: 3, re: /\b(task[- ]based (income|earning)|commission[- ]only|recruit (friends|others) to earn|multi[- ]level marketing|mlm)\b/i, why: 'Task-commission or recruit-others income' },
];

export function scamCheck(job) {
  const text = `${job.title || ''}\n${job.company || ''}\n${job.description || ''}`;
  const reasons = [];
  let score = 0;
  for (const s of SIGNALS) {
    if (s.re.test(text)) {
      score += s.w;
      reasons.push(s.why);
    }
  }
  if (!String(job.company || '').trim() || /^(confidential|undisclosed|private (company|client))$/i.test(String(job.company).trim())) {
    score += 1;
    reasons.push('Company name hidden');
  }
  if ((job.description || '').length > 0 && (job.description || '').length < 250) {
    score += 1;
    reasons.push('Very short description');
  }
  const risk = score >= 5 ? 'high' : score >= 3 ? 'medium' : 'low';
  return { risk, score, reasons };
}

// "Ghost job" signals: very old, reposted, or evergreen talent-pool listings.
export function staleCheck(job, ageDays) {
  const reasons = [];
  if (ageDays !== null && ageDays !== undefined && ageDays > 30) reasons.push(`Posted ${ageDays} days ago`);
  if (/\b(talent (pool|community|network)|general (application|interest)|expression of interest|future opportunities|speculative application|open application)\b/i.test(`${job.title} ${job.description?.slice(0, 600) || ''}`)) {
    reasons.push('Evergreen / talent-pool listing, not a specific opening');
  }
  return { stale: reasons.length > 0, reasons };
}
