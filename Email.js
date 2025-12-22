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
        case 'FORM_RESPONSE': handleFormResponse(email, body, msg); break;
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
    const notFoundHtml = EmailTemplates.wrap(`
      <h3>Application Not Found</h3>
      <p>Hello ${analysis.name || 'there'},</p>
      <p>We couldn't find your application in our system.</p>
      ${EmailTemplates.warningBox('Please ensure you have applied through our official channels before submitting your test.')}
      <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
    `);
    message.reply('', { htmlBody: notFoundHtml });
    return;
  }

  SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.TEST_SUBMITTED);

  const attachments = message.getAttachments();
  GmailApp.sendEmail(CONFIG.TEAM.ADMIN_EMAIL, `Test Submission: ${analysis.name}`,
    `${analysis.name} has submitted their test.\nEmail: ${email}\nAttachments: ${attachments.length}`,
    { attachments: attachments, name: 'Urbanmistrii Oracle' });

  const submissionHtml = EmailTemplates.wrap(`
    <h3>Test Received</h3>
    <p>Hello <strong>${analysis.name}</strong>,</p>
    <p>Thank you for submitting your test! We have received your submission and our team will begin the review process.</p>
    <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #e74c3c; margin: 25px 0;">
      <p style="margin: 0 0 10px 0;"><strong>What happens next?</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Our design team will review your submission</li>
        <li>You will receive feedback within 2-3 business days</li>
        <li>We will contact you for the next steps</li>
      </ul>
    </div>
    <p>We appreciate your effort and look forward to reviewing your work!</p>
    <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
  `);
  message.reply('', { htmlBody: submissionHtml });
  CandidateTimeline.add(email, 'TEST_SUBMISSION_EMAIL_PROCESSED');
}

/**
 * Handle structured form-like responses from candidates
 * When candidates reply with their details in Q&A format, parse and save to sheet
 */
function handleFormResponse(email, body, message) {
  Log.info('EMAIL', 'Processing form response', { email: Sanitize.maskEmail(email) });

  // Extract structured data from email
  const formData = AI.extractFormResponse(body, email);

  if (!formData || !formData.name) {
    Log.error('EMAIL', 'Failed to extract form data', { email: Sanitize.maskEmail(email) });
    // Escalate to admin
    Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `Form Response Parse Failed: ${email}`,
      `Could not parse candidate response. Manual review needed.\n\nEmail:\n${body.substring(0, 1500)}`);
    return;
  }

  Log.info('EMAIL', 'Form data extracted', { name: formData.name, role: formData.role });

  // Check if candidate already exists
  const existing = SheetUtils.findCandidateByEmail(email);
  const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);

  if (existing) {
    // Update existing candidate row
    Log.info('EMAIL', 'Updating existing candidate', { row: existing.row });

    // Update fields that were provided
    if (formData.name) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.NAME, formData.name);
    if (formData.phone) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.PHONE, formData.phone);
    if (formData.role) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.ROLE, formData.role);
    if (formData.degree) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.DEGREE, formData.degree);
    if (formData.startDate) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.START_DATE, formData.startDate);
    if (formData.tenure) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.TENURE, formData.tenure);
    if (formData.salaryExpected) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.SALARY_EXP, formData.salaryExpected);
    if (formData.salaryLast) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.SALARY_LAST, formData.salaryLast);
    if (formData.experience) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.EXPERIENCE, formData.experience);
    if (formData.portfolioUrl) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.PORTFOLIO_URL, formData.portfolioUrl);
    if (formData.cvUrl) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.CV_URL, formData.cvUrl);
    if (formData.city) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.CITY, formData.city);
    if (formData.hindiProficient) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.HINDI, formData.hindiProficient);
    if (formData.healthNotes) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.HEALTH, formData.healthNotes);
    if (formData.previousApplication) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.PREV_EXP, formData.previousApplication);
    if (formData.testAvailability) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.INTERVIEW_DATE, formData.testAvailability);
    if (formData.willingToRelocate) SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.RELOCATION, formData.willingToRelocate);

    SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.UPDATED, new Date());
    SheetUtils.updateCell(existing.row, CONFIG.COLUMNS.LOG, '📝 Form response updated via email');

  } else {
    // Create new candidate row
    Log.info('EMAIL', 'Creating new candidate from form response');

    const department = ConfigHelpers.getDepartment(formData.role || '');

    sheet.appendRow([
      CONFIG.RULES.STATUSES.NEW,           // STATUS
      new Date(),                           // UPDATED
      new Date(),                           // TIMESTAMP
      formData.name,                        // NAME
      formData.phone || '',                 // PHONE
      formData.email || email,              // EMAIL
      formData.role || '',                  // ROLE
      formData.degree || '',                // DEGREE
      formData.startDate || '',             // START_DATE
      formData.tenure || '',                // TENURE
      formData.salaryExpected || '',        // SALARY_EXP
      formData.salaryLast || '',            // SALARY_LAST
      formData.experience || '',            // EXPERIENCE
      formData.portfolioUrl || '',          // PORTFOLIO_URL
      formData.cvUrl || '',                 // CV_URL
      formData.city || '',                  // CITY
      formData.hindiProficient || '',       // HINDI
      formData.healthNotes || '',           // HEALTH
      formData.previousApplication || '',   // PREV_EXP
      formData.testAvailability || '',      // INTERVIEW_DATE (test availability)
      '',                                   // INTERVIEW_TIME
      '',                                   // EMAIL_ALT
      formData.willingToRelocate || '',     // RELOCATION
      'From email form response',        // LOG
      '', '', '', '', department, '', ''    // System columns
    ]);
  }

  // Send confirmation email
  const confirmHtml = EmailTemplates.wrap(`
    <h3>Details Received!</h3>
    <p>Hello <strong>${formData.name}</strong>,</p>
    <p>Thank you for providing your details. We have successfully recorded your information in our system.</p>
    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #4caf50; margin: 25px 0;">
      <p style="margin: 0;"><strong>What happens next?</strong></p>
      <p style="margin: 10px 0 0 0;">Our team will review your profile and send you the design test shortly. Please keep an eye on your inbox.</p>
    </div>
    <p>If you have any questions, feel free to reply to this email.</p>
    <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
  `);

  GmailApp.sendEmail(email, 'Details Received - Urbanmistrii',
    `Hi ${formData.name}, Thank you for your details. We'll send you the design test shortly.`,
    { htmlBody: confirmHtml, name: 'Urbanmistrii Hiring' });

  // Notify admin
  Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `Form Response: ${formData.name}`,
    `Candidate responded with details via email.\n\nName: ${formData.name}\nRole: ${formData.role}\nEmail: ${email}\nPhone: ${formData.phone}\nCity: ${formData.city}\nTest Availability: ${formData.testAvailability}\n\nReview at: ${getSheetUrl()}`);

  CandidateTimeline.add(email, 'FORM_RESPONSE_PROCESSED', { name: formData.name });
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
    candidateInfo.phone, 'From email', candidateInfo.role || analysis.role,
    '', '', candidateInfo.portfolioLinks ? candidateInfo.portfolioLinks.join(', ') : '', '', '',
    department, '', '', '', '' // v22.0: New columns
  ]);

  Log.success('EMAIL', 'New candidate added', { name: candidateInfo.name, department });

  // Send branded HTML email with form link
  const applicationHtml = EmailTemplates.wrap(`
    <h3>Application Received!</h3>
    <p>Hello <strong>${candidateInfo.name || 'there'}</strong>,</p>
    <p>Thank you for your interest in joining Urbanmistrii! We have received your application.</p>
    <p>To ensure we have all the necessary details, please complete our official application form:</p>
    ${EmailTemplates.button('FILL APPLICATION FORM', CONFIG.APPLICATION_FORM_URL)}
    <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #e74c3c; margin: 25px 0;">
      <p style="margin: 0 0 10px 0;"><strong>What to include:</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Your portfolio/work samples</li>
        <li>Contact details</li>
        <li>Preferred interview availability</li>
      </ul>
    </div>
    <p>Once you've submitted the form, our team will review your application and get back to you within 1-2 business days.</p>
    <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
  `);

  GmailApp.sendEmail(email, 'Complete Your Application - Urbanmistrii',
    `Hi ${candidateInfo.name || 'there'}, Thank you for applying! Please complete our application form: ${CONFIG.APPLICATION_FORM_URL}`,
    { htmlBody: applicationHtml, name: 'Urbanmistrii Hiring' });

  Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `New Application: ${candidateInfo.name}`,
    `New candidate from email (${department} dept).\\n\\nEmail: ${email}\\nName: ${candidateInfo.name}\\n\\nForm link sent to candidate.\\n\\nReview at: ${getSheetUrl()}`);
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

  const statusHtml = EmailTemplates.wrap(`
    <h3>Application Status Update</h3>
    <p>Hello <strong>${name}</strong>,</p>
    <p>Thank you for checking in! Here's the current status of your application:</p>
    <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #e74c3c; margin: 25px 0;">
      <p style="margin: 0;"><strong>Current Status:</strong> ${status}</p>
    </div>
    <p>We'll keep you updated on any changes. If you have any questions, feel free to reply to this email.</p>
    <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
  `);
  GmailApp.sendEmail(email, 'Your Application Status', `Hi ${name}, Your current status is: ${status}`, { htmlBody: statusHtml, name: 'Urbanmistrii' });
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
    const replyHtml = EmailTemplates.wrap(`
      <h3>Your Question</h3>
      <p>Hello <strong>${context.name}</strong>,</p>
      <p>${reply.replace(/\n/g, '<br>')}</p>
      <p>If you have any more questions, feel free to ask!</p>
      <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
    `);
    GmailApp.sendEmail(email, 'Re: Your Question', reply, { htmlBody: replyHtml, name: 'Urbanmistrii' });
    Log.success('EMAIL', 'AI-generated reply sent');
  } else {
    Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `Question from ${context.name}`,
      `Candidate question needs manual response:\n\nFrom: ${email}\nQuestion:\n${body.substring(0, 1000)}`);
  }
}

function handleEmailEscalation(email, subject, body) {
  Log.warn('EMAIL', 'Escalation detected', { email: Sanitize.maskEmail(email) });
  Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `🚨 URGENT: Escalated Email from ${email}`,
    `Urgent email needs attention.\n\nFrom: ${email}\nSubject: ${subject}\n\nBody:\n${body}`);
  const escalationHtml = EmailTemplates.wrap(`
    <h3>Message Received</h3>
    <p>Hello,</p>
    <p>We've received your message and it has been flagged as a priority. A member of our HR team will review and respond to you personally.</p>
    <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #f39c12; margin: 20px 0;">
      <strong>Expected Response Time:</strong> 1-2 business days
    </div>
    <p>Thank you for your patience.</p>
    <p>Best regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
  `);
  GmailApp.sendEmail(email, 'Re: ' + subject, 'We have received your message and will respond soon.', { htmlBody: escalationHtml, name: 'Urbanmistrii' });
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
