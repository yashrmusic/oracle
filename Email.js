/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.1 - EMAIL MODULE                      ║
 * ║                 Gmail Processing & Smart Responses (Enhanced)                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Process Gmail inbox for candidate emails
 */
/**
 * Process Gmail inbox for candidate emails
 * Uses 'ORACLE_PROCESSED' label to track state without marking as read
 */
function processInbox() {
  try {
    // Ensure label exists
    const labelName = 'ORACLE_PROCESSED';
    let label = GmailApp.getUserLabelByName(labelName);
    if (!label) label = GmailApp.createLabel(labelName);

    // Search for unread emails that haven't been processed
    const threads = GmailApp.search(`is:unread -label:${labelName} -category:social`, 0, 10);
    if (threads.length === 0) return;

    Log.info('INBOX', `Processing ${threads.length} unread emails`);

    for (const thread of threads) {
      const msg = thread.getMessages().pop();
      const from = msg.getFrom();
      const email = (from.match(/[\w.-]+@[\w.-]+\.\w+/) || [''])[0];
      const subject = msg.getSubject();
      const body = msg.getPlainBody().substring(0, 1000);
      const hasAttachments = msg.getAttachments().length > 0;

      const analysis = AI.analyzeIntent(body, subject, hasAttachments);
      if (!analysis) {
        // Mark as processed even if analysis failed to avoid infinite loop
        thread.addLabel(label);
        Log.warn('INBOX', 'AI analysis failed - skipped', { email, subject });
        continue;
      }

      Log.info('INBOX', 'Email analyzed', { email: Sanitize.maskEmail(email), intent: analysis.intent });

      switch (analysis.intent) {
        case 'TEST_SUBMISSION': handleEmailTestSubmission(email, analysis, msg); break;
        case 'NEW_APPLICATION': handleEmailApplication(email, analysis, msg); break;
        case 'FOLLOWUP': handleEmailFollowup(email, analysis); break;
        case 'QUESTION': handleEmailQuestion(email, analysis, body); break;
        case 'ESCALATE': handleEmailEscalation(email, subject, body); break;
      }

      // Mark as processed (adds label, keeps Unread status)
      thread.addLabel(label);
    }
  } catch (e) {
    Log.error('INBOX', 'Failed to process inbox', { error: e.message });
  }
}

function handleEmailTestSubmission(email, analysis, message) {
  Log.info('EMAIL', 'Processing test submission', { email: Sanitize.maskEmail(email) });
  const candidate = SheetUtils.findCandidateByEmail(email);

  if (!candidate) {
    message.reply(`Hi ${analysis.name || 'there'},\n\nWe couldn't find your application. Please apply first.\n\nBest,\nTeam UrbanMistrii`);
    return;
  }

  SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.TEST_SUBMITTED);

  const attachments = message.getAttachments();
  GmailApp.sendEmail(CONFIG.TEAM.ADMIN_EMAIL, `📝 Test Submission: ${analysis.name}`,
    `${analysis.name} has submitted their test.\nEmail: ${email}\nAttachments: ${attachments.length}`,
    { attachments: attachments, name: 'Oracle v21.0' });

  message.reply(`Hi ${analysis.name},\n\nThank you for submitting your test! 🎉\n\nOur team will review it and get back to you within 2-3 days.\n\nBest,\nTeam UrbanMistrii`);
  CandidateTimeline.add(email, 'TEST_SUBMISSION_EMAIL_PROCESSED');
}

function handleEmailApplication(email, analysis, message) {
  Log.info('EMAIL', 'Processing new application', { email: Sanitize.maskEmail(email) });

  // v22.0: Check for duplicates
  if (CONFIG.FEATURES.DUPLICATE_CHECK) {
    const candidateInfo = AI.extractCandidateInfo(message.getPlainBody(), message.getSubject());
    const dupCheck = Duplicates.check(email, candidateInfo?.phone, candidateInfo?.name || analysis.name);

    if (dupCheck.isDuplicate) {
      Log.info('EMAIL', 'Duplicate detected', {
        email: Sanitize.maskEmail(email),
        matchType: dupCheck.matchType,
        similarity: dupCheck.similarity
      });

      const response = Duplicates.getResponse(dupCheck.existingData);
      message.reply(response);
      CandidateTimeline.add(email, 'DUPLICATE_APPLICATION_BLOCKED', { matchType: dupCheck.matchType });
      return;
    }
  }

  // Check for existing application by email only
  const existing = SheetUtils.findCandidateByEmail(email);
  if (existing) {
    message.reply(`Hi ${analysis.name || 'there'},\n\nWe already have your application! Status: ${existing.data[CONFIG.COLUMNS.STATUS - 1]}\n\nBest,\nTeam UrbanMistrii`);
    return;
  }

  const candidateInfo = AI.extractCandidateInfo(message.getPlainBody(), message.getSubject());
  if (!candidateInfo) {
    Log.error('EMAIL', 'Failed to extract candidate info', { email });
    return;
  }

  // v22.0: Spam detection
  const spamCheck = AI.detectSpam(email, candidateInfo.name, message.getPlainBody());
  if (spamCheck.isSpam && spamCheck.confidence > 0.8) {
    Log.warn('EMAIL', 'Spam application detected', { email, reasons: spamCheck.reasons });
    CandidateTimeline.add(email, 'SPAM_APPLICATION_BLOCKED', { confidence: spamCheck.confidence });
    return; // Silently ignore spam
  }

  // v22.0: Detect department from role
  const role = candidateInfo.role || analysis.role || '';
  const department = ConfigHelpers.getDepartment(role);

  const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
  sheet.appendRow([
    CONFIG.RULES.STATUSES.NEW, new Date(), new Date(),
    candidateInfo.name || analysis.name, candidateInfo.email || email,
    candidateInfo.phone, '📧 From email', candidateInfo.role || analysis.role,
    '', '', candidateInfo.portfolioLinks ? candidateInfo.portfolioLinks.join(', ') : '', '', '',
    department, '', '', '', '' // v22.0: New columns
  ]);

  Log.success('EMAIL', 'New candidate added', { name: candidateInfo.name, department });
  message.reply(`Hi ${candidateInfo.name || 'there'},\n\nThank you for applying! 🎉\n\nWe'll review and get back within 1-2 days.\n\nBest,\nTeam UrbanMistrii`);
  Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `📥 New Application: ${candidateInfo.name}`, `New candidate from email (${department} dept).\n\nReview at: ${getSheetUrl()}`);
}

function handleEmailFollowup(email, analysis) {
  Log.info('EMAIL', 'Processing follow-up', { email: Sanitize.maskEmail(email) });
  const candidate = SheetUtils.findCandidateByEmail(email);

  if (!candidate) {
    Log.warn('EMAIL', 'Candidate not found for follow-up - SKIPPING auto-reply to prevent spam', { email: Sanitize.maskEmail(email) });
    // GmailApp.sendEmail(email, 'Re: Your Application Status',
    //   `Hi there,\n\nWe couldn't find your application. Please provide your full name and role applied for.\n\nBest,\nTeam UrbanMistrii`);
    return;
  }

  const status = candidate.data[CONFIG.COLUMNS.STATUS - 1];
  const name = candidate.data[CONFIG.COLUMNS.NAME - 1];

  GmailApp.sendEmail(email, 'Your Application Status',
    `Hi ${name},\n\nYour current status is: ${status}\n\nWe'll update you soon!\n\nBest,\nTeam UrbanMistrii`);
  CandidateTimeline.add(email, 'FOLLOWUP_EMAIL_SENT');

  // v22.1: Log to DB_FollowUp
  try {
    const followSheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.FOLLOWUP);
    const phone = candidate.data[CONFIG.COLUMNS.PHONE - 1] || '';
    followSheet.appendRow([new Date(), name, phone, 'EMAIL_STATUS_CHECK', status]);
  } catch (e) {
    Log.warn('FOLLOWUP', 'Failed to log follow-up', { error: e.message });
  }
}

function handleEmailQuestion(email, analysis, body) {
  Log.info('EMAIL', 'Processing question', { email: Sanitize.maskEmail(email) });
  const candidate = SheetUtils.findCandidateByEmail(email);

  const context = {
    name: candidate ? candidate.data[CONFIG.COLUMNS.NAME - 1] : analysis.name,
    role: candidate ? candidate.data[CONFIG.COLUMNS.ROLE - 1] : 'unknown',
    status: candidate ? candidate.data[CONFIG.COLUMNS.STATUS - 1] : 'not in system'
  };

  const reply = AI.suggestReply(body.substring(0, 500), context);

  if (reply) {
    GmailApp.sendEmail(email, 'Re: Your Question', reply);
    Log.success('EMAIL', 'AI-generated reply sent');
  } else {
    Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `❓ Question from ${context.name}`,
      `Candidate question needs manual response:\n\nFrom: ${email}\nQuestion:\n${body.substring(0, 1000)}`);
  }
}

function handleEmailEscalation(email, subject, body) {
  Log.warn('EMAIL', 'Escalation detected', { email: Sanitize.maskEmail(email) });
  Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `🚨 URGENT: Escalated Email from ${email}`,
    `Urgent email needs attention.\n\nFrom: ${email}\nSubject: ${subject}\n\nBody:\n${body}`);
  GmailApp.sendEmail(email, 'Re: ' + subject,
    `Hello,\n\nWe've received your message and flagged it as urgent. Our team will respond soon.\n\nBest,\nTeam UrbanMistrii`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//                        CANDIDATE TIMELINE TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

const CandidateTimeline = {
  add(email, event, data = {}) {
    try {
      const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.TIMELINE);
      sheet.appendRow([new Date(), email, event, JSON.stringify(data)]);
      Log.info('TIMELINE', 'Event recorded', { email: Sanitize.maskEmail(email), event });
    } catch (e) {
      Log.error('TIMELINE', 'Failed to record event', { email, event, error: e.message });
    }
  },

  get(email) {
    try {
      const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.TIMELINE);
      const data = sheet.getDataRange().getValues();
      const timeline = [];
      for (let i = 1; i < data.length; i++) {
        if (data[i][1] === email) {
          timeline.push({ timestamp: data[i][0], event: data[i][2], data: data[i][3] ? JSON.parse(data[i][3]) : {} });
        }
      }
      return timeline;
    } catch (e) {
      return [];
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                        PRIVACY-SAFE SYNC
// ═══════════════════════════════════════════════════════════════════════════════

function syncToPublicView() {
  try {
    Log.info('SYNC', 'Starting privacy-safe sync');

    const master = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
    const masterData = master.getDataRange().getValues();
    if (masterData.length === 0) {
      Log.warn('SYNC', 'Master sheet is empty');
      return;
    }

    const safeColumns = [];
    masterData[0].forEach((header, index) => {
      if (!ConfigHelpers.isSensitive(header)) safeColumns.push(index);
    });

    const safeData = masterData.map(row => safeColumns.map(colIndex => row[colIndex]));

    const publicSs = SpreadsheetApp.openById(CONFIG.SHEETS.PUBLIC_ID);
    let publicSheet = publicSs.getSheetByName('Team View');
    if (!publicSheet) publicSheet = publicSs.insertSheet('Team View');

    if (safeData.length > 0) {
      publicSheet.clearContents();
      publicSheet.getRange(1, 1, safeData.length, safeData[0].length).setValues(safeData);
      publicSheet.getRange(1, 1, 1, safeData[0].length).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
    }

    Log.success('SYNC', 'Public view synced', { rows: safeData.length });
  } catch (e) {
    Log.error('SYNC', 'Failed to sync', { error: e.message });
  }
}
