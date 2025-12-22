/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.1 - CORE ENGINE                       ║
 * ║                 Main Orchestrator & Automation Logic (Enhanced)               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * FORM SUBMIT HANDLER - Fires when Google Form submits new entry
 * NOTE: INTERVIEW_DATE column is actually "Test Availability Date" - when candidate wants to take test
 * The proper flow is: NEW -> IN PROCESS -> TEST SENT -> TEST SUBMITTED -> INTERVIEW PENDING
 */
function onFormSubmit(e) {
  try {
    const sheet = e.range.getSheet();
    if (sheet.getName() !== CONFIG.SHEETS.TABS.CANDIDATES) return;

    const row = e.range.getRow();
    const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    const candidate = {
      row: row,
      name: rowData[CONFIG.COLUMNS.NAME - 1] || 'Candidate',
      email: rowData[CONFIG.COLUMNS.EMAIL - 1],
      phone: rowData[CONFIG.COLUMNS.PHONE - 1],
      role: rowData[CONFIG.COLUMNS.ROLE - 1] || 'Design Intern',
      testAvailabilityDate: rowData[CONFIG.COLUMNS.INTERVIEW_DATE - 1], // This is TEST availability, not interview
      testAvailabilityTime: rowData[CONFIG.COLUMNS.INTERVIEW_TIME - 1]
    };

    Log.info('FORM', `New form submission from ${candidate.name}`, { row: row });

    // Set initial status to NEW
    if (!rowData[CONFIG.COLUMNS.STATUS - 1]) {
      SheetUtils.updateCell(row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.NEW);
    }
    SheetUtils.updateCell(row, CONFIG.COLUMNS.UPDATED, new Date());

    // Log if test date was provided (test scheduling, NOT interview)
    if (candidate.testAvailabilityDate) {
      SheetUtils.updateCell(row, CONFIG.COLUMNS.LOG,
        `Test availability: ${candidate.testAvailabilityDate} ${candidate.testAvailabilityTime || ''}`.trim());
    }

    // Notify admin about new candidate
    Notify.email(CONFIG.TEAM.ADMIN_EMAIL, `New Form Submission: ${candidate.name}`,
      `New application received!\n\n` +
      `Name: ${candidate.name}\n` +
      `Role: ${candidate.role}\n` +
      `Email: ${candidate.email}\n` +
      `Phone: ${candidate.phone}\n` +
      (candidate.testAvailabilityDate ? `Preferred Test Date: ${candidate.testAvailabilityDate} ${candidate.testAvailabilityTime || ''}\n` : '') +
      `\nReview & set status to "IN PROCESS" to send welcome message.\n` +
      `Set status to "TEST SENT" to dispatch the test.\n` +
      `\nSheet: ${getSheetUrl()}`);

    CandidateTimeline.add(candidate.email, 'FORM_SUBMITTED', {
      role: candidate.role,
      hasTestDate: !!candidate.testAvailabilityDate
    });

  } catch (err) {
    Log.error('FORM', 'Form submission handler failed', { error: err.message });
  }
}

/**
 * Send interview confirmation email to candidate with beautiful HTML template
 * NOTE: This should only be called for ACTUAL interviews, not test scheduling
 */
function sendInterviewConfirmationEmail(candidate) {
  try {
    if (!candidate.email) {
      Log.warn('CONFIRM', 'No email for interview confirmation', { name: candidate.name });
      return { success: false, error: 'No email' };
    }

    // Parse date properly - handle Date objects, strings, and spreadsheet date values
    let dateStr = '';
    const rawDate = candidate.interviewDate;

    if (rawDate instanceof Date && !isNaN(rawDate.getTime()) && rawDate.getFullYear() > 1900) {
      dateStr = DateTime.formatIST(rawDate, 'full');
    } else if (typeof rawDate === 'string' && rawDate.trim()) {
      // Try to parse the string as a date
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900) {
        dateStr = DateTime.formatIST(parsed, 'full');
      } else {
        dateStr = rawDate; // Use as-is if can't parse
      }
    }

    // Parse time - handle Date objects (spreadsheet times) and strings
    let timeStr = '';
    const rawTime = candidate.interviewTime;

    if (rawTime instanceof Date && !isNaN(rawTime.getTime())) {
      // Spreadsheet time values are Date objects for 1899-12-30
      const hours = rawTime.getHours();
      const mins = rawTime.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      timeStr = `${hour12}:${mins.toString().padStart(2, '0')} ${ampm} IST`;
    } else if (typeof rawTime === 'string' && rawTime.trim()) {
      timeStr = rawTime.trim();
    }

    const fullDateTime = `${dateStr} ${timeStr}`.trim() || 'To be confirmed';

    // Generate Google Calendar link
    const calendarLink = generateCalendarLink(candidate.name, candidate.role, candidate.interviewDate, candidate.interviewTime);

    // Beautiful HTML email template (UrbanMistrii v9.1 style)
    const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; color: #333333;">
    
    <!-- Header -->
    <div style="background-color: #1a1a1a; padding: 30px 40px; text-align: left; border-bottom: 4px solid #e74c3c;">
      <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 2px; margin: 0; text-transform: uppercase;">URBANMISTRII</h1>
    </div>

    <!-- Body -->
    <div style="padding: 40px; line-height: 1.6; font-size: 15px;">
      
      <h3 style="color: #1a1a1a; margin-top: 0;">Interview Confirmed</h3>
      
      <p>Hello <strong>${candidate.name}</strong>,</p>
      
      <p>Thank you for scheduling your interview with Urbanmistrii. We're excited to learn more about you and discuss the opportunity.</p>
      
      <!-- Details Box -->
      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #e74c3c; margin: 25px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Position:</strong> ${candidate.role}</p>
        <p style="margin: 0 0 10px 0;"><strong>Date & Time:</strong> ${fullDateTime}</p>
        <p style="margin: 0;"><strong>Duration:</strong> 30-45 minutes</p>
      </div>
      
      <!-- Add to Calendar Button -->
      <div style="text-align: center; margin: 25px 0;">
        <a href="${calendarLink}" style="display: inline-block; background-color: #e74c3c; color: #ffffff !important; padding: 14px 30px; text-decoration: none; font-weight: 600; border-radius: 2px;">
          &#128197; ADD TO GOOGLE CALENDAR
        </a>
      </div>
      
      <h4 style="color: #1a1a1a; margin-bottom: 10px;">What to Expect</h4>
      <ul style="margin: 0 0 25px 0; padding-left: 20px; color: #555;">
        <li>We'll discuss your experience, portfolio, and design approach</li>
        <li>Please have your portfolio ready to share</li>
        <li>Feel free to ask us any questions about the role</li>
      </ul>
      
      <!-- Reschedule Note -->
      <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #f39c12; margin: 20px 0;">
        <strong>Need to reschedule?</strong><br>
        Please reply to this email at least 24 hours before your scheduled time.
      </div>
      
      <p>We look forward to meeting you!</p>
      
      <p style="margin-bottom: 0;">
        Best regards,<br>
        <strong>Hiring Team, Urbanmistrii</strong>
      </p>
      
    </div>

    <!-- Footer -->
    <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #888;">
      &copy; ${new Date().getFullYear()} Urbanmistrii. All Rights Reserved.
    </div>

  </div>
</body>
</html>`;

    // Plain text fallback
    const plainBody = `Dear ${candidate.name},

Thank you for scheduling your interview with UrbanMistrii!

Interview Details:
- Date & Time: ${fullDateTime}
- Position: ${candidate.role}
- Duration: 30-45 minutes

What to Expect:
- We'll discuss your experience, portfolio, and design approach
- Please have your portfolio ready to share

Need to reschedule? Reply to this email at least 24 hours before your scheduled time.

We look forward to meeting you!

Best regards,
Team UrbanMistrii
hr@urbanmistrii.com`;

    // Send with HTML body
    GmailApp.sendEmail(candidate.email, `Interview Confirmed - ${fullDateTime}`, plainBody, {
      htmlBody: htmlBody,
      name: 'UrbanMistrii HR'
    });

    Log.success('CONFIRM', 'Interview confirmation sent', {
      name: candidate.name,
      datetime: fullDateTime
    });

    // Update sheet log
    if (candidate.row) {
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, 'Interview confirmed: ' + fullDateTime);
    }

    // Log to timeline
    CandidateTimeline.add(candidate.email, 'INTERVIEW_CONFIRMATION_SENT', {
      datetime: fullDateTime
    });

    return { success: true };

  } catch (err) {
    Log.error('CONFIRM', 'Failed to send interview confirmation', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * TEST: Send a sample interview confirmation email
 * Usage: testInterviewEmail() or testInterviewEmail("your@email.com")
 */
function testInterviewEmail(email) {
  const testCandidate = {
    name: 'Test Candidate',
    email: email || 'mail@urbanmistrii.com',
    role: 'Design Intern',
    interviewDate: 'Saturday, December 21, 2024',
    interviewTime: '11:00 AM IST'
  };

  Logger.log('Sending test email to: ' + testCandidate.email);
  const result = sendInterviewConfirmationEmail(testCandidate);
  Logger.log(result.success ? 'Email sent successfully!' : 'Failed: ' + result.error);
  return result;
}

/**
 * Process candidates who have interview dates but no confirmation sent
 * Run this periodically or manually to catch missed confirmations
 */
function processUnconfirmedInterviews() {
  Logger.log('╔═══════════════════════════════════════════════════════════════════╗');
  Logger.log('║         PROCESSING UNCONFIRMED INTERVIEWS                        ║');
  Logger.log('╚═══════════════════════════════════════════════════════════════════╝');

  try {
    const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
    const data = sheet.getDataRange().getValues();

    let confirmed = 0;
    let errors = 0;

    for (let i = 1; i < data.length; i++) {
      const row = i + 1;
      const interviewDate = data[i][CONFIG.COLUMNS.INTERVIEW_DATE - 1];
      const log = data[i][CONFIG.COLUMNS.LOG - 1] || '';
      const email = data[i][CONFIG.COLUMNS.EMAIL - 1];
      const name = data[i][CONFIG.COLUMNS.NAME - 1];

      // If has interview date but no confirmation in log
      if (interviewDate && email && !log.includes('confirmed') && !log.includes('Interview confirmed')) {
        Logger.log(`   → Row ${row}: Sending confirmation to ${name}...`);

        const candidate = {
          row: row,
          name: name,
          email: email,
          role: data[i][CONFIG.COLUMNS.ROLE - 1] || 'Design Intern',
          interviewDate: interviewDate,
          interviewTime: data[i][CONFIG.COLUMNS.INTERVIEW_TIME - 1]
        };

        const result = sendInterviewConfirmationEmail(candidate);

        if (result.success) {
          confirmed++;
          Logger.log(`     ✅ Confirmation sent`);
        } else {
          errors++;
          Logger.log(`     ❌ Failed: ${result.error}`);
        }

        // Rate limit
        Utilities.sleep(1000);
      }
    }

    Logger.log('');
    Logger.log(`   ✅ Sent ${confirmed} confirmations, ${errors} errors`);
    return { confirmed, errors };

  } catch (e) {
    Logger.log('❌ Failed: ' + e.message);
    return { confirmed: 0, errors: 1, error: e.message };
  }
}

/**
 * 🆕 Send confirmation to a specific row
 */
function sendConfirmationToRow(rowNumber) {
  try {
    const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
    const rowData = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];

    const candidate = {
      row: rowNumber,
      name: rowData[CONFIG.COLUMNS.NAME - 1] || 'Candidate',
      email: rowData[CONFIG.COLUMNS.EMAIL - 1],
      role: rowData[CONFIG.COLUMNS.ROLE - 1] || 'Design Intern',
      interviewDate: rowData[CONFIG.COLUMNS.INTERVIEW_DATE - 1],
      interviewTime: rowData[CONFIG.COLUMNS.INTERVIEW_TIME - 1]
    };

    if (!candidate.email) {
      Logger.log('❌ No email for row ' + rowNumber);
      return { success: false, error: 'No email' };
    }

    if (!candidate.interviewDate) {
      Logger.log('❌ No interview date for row ' + rowNumber);
      return { success: false, error: 'No interview date' };
    }

    const result = sendInterviewConfirmationEmail(candidate);
    Logger.log(`Row ${rowNumber}: ${result.success ? '✅ Confirmation sent' : '❌ Failed: ' + result.error}`);
    return result;

  } catch (e) {
    Logger.log('❌ Error: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Main automation trigger - fires on status changes
 */
function universalAutomationEngine(e) {
  try {
    const sheet = e.source.getActiveSheet();
    const range = e.range;
    const row = range.getRow();

    if (sheet.getName() !== CONFIG.SHEETS.TABS.CANDIDATES) return;
    if (range.getColumn() !== CONFIG.COLUMNS.STATUS) return;
    if (row < 2) return;

    const status = range.getValue();
    const rowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    const candidate = {
      row: row,
      status: status,
      name: rowData[CONFIG.COLUMNS.NAME - 1] || 'Candidate',
      email: rowData[CONFIG.COLUMNS.EMAIL - 1],
      phone: rowData[CONFIG.COLUMNS.PHONE - 1],
      role: rowData[CONFIG.COLUMNS.ROLE - 1] || 'intern',
      department: rowData[CONFIG.COLUMNS.DEPARTMENT - 1]
    };

    Log.info('AUTOMATION', `Status changed to: ${status}`, { row: row, name: candidate.name });
    SheetUtils.updateCell(row, CONFIG.COLUMNS.UPDATED, new Date());
    handleStatusChange(candidate, sheet);

  } catch (e) {
    Log.critical('AUTOMATION', 'Automation engine crashed', { error: e.message });
  }
}

function handleStatusChange(candidate, sheet) {
  switch (candidate.status) {
    case CONFIG.RULES.STATUSES.NEW: handleNewCandidate(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.IN_PROCESS: handleInProcess(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.TEST_SENT: handleTestSent(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.TEST_SUBMITTED: handleTestSubmitted(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.INTERVIEW_PENDING: handleInterviewPending(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.PENDING_REJECTION: handlePendingRejection(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.REJECTED: handleRejected(candidate, sheet); break;
    case CONFIG.RULES.STATUSES.HIRED: handleHired(candidate, sheet); break;
  }
}

function handleNewCandidate(candidate, sheet) {
  Log.info('HANDLER', 'New candidate received', { name: candidate.name });
  CandidateTimeline.add(candidate.email, 'APPLICATION_RECEIVED', { role: candidate.role });
  Notify.email(CONFIG.TEAM.ADMIN_EMAIL, '📥 New Candidate Application',
    `New application from ${candidate.name} for ${candidate.role} role.\n\nReview at: ${getSheetUrl()}`);
  SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '📥 Application logged');
}

function handleInProcess(candidate, sheet) {
  Log.info('HANDLER', 'Sending welcome message', { name: candidate.name });
  if (!candidate.phone) {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '⚠️ No phone');
    return;
  }
  const result = WhatsApp.sendWelcome(candidate.phone, candidate.name);
  SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, result.success ? '✅ Welcome sent' : `❌ Failed: ${result.error}`);
  if (result.success) CandidateTimeline.add(candidate.email, 'WELCOME_SENT');
}

function handleTestSent(candidate, sheet) {
  Log.info('HANDLER', 'Sending test link', { name: candidate.name });
  if (!candidate.phone) {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '⚠️ No phone');
    return;
  }
  const result = WhatsApp.sendTestLink(candidate.phone, candidate.name, candidate.role, candidate.department);
  if (result.success) {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.TEST_SENT, new Date());
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '✅ Test sent');
    CandidateTimeline.add(candidate.email, 'TEST_SENT', { role: candidate.role });
  } else {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `❌ Failed: ${result.error}`);
  }
}

function handleTestSubmitted(candidate, sheet) {
  Log.info('HANDLER', 'Processing test submission', { name: candidate.name });
  const testSentTime = sheet.getRange(candidate.row, CONFIG.COLUMNS.TEST_SENT).getValue();
  const submittedTime = new Date();

  if (testSentTime) {
    const hoursTaken = DateTime.hoursBetween(testSentTime, submittedTime);
    const timeLimit = ConfigHelpers.getTimeLimit(candidate.role, candidate.department);
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.TEST_SUBMITTED, submittedTime);
    const withinLimit = hoursTaken <= timeLimit;
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG,
      `${withinLimit ? '✅' : '⚠️'} Submitted in ${hoursTaken.toFixed(1)}h (limit: ${timeLimit}h)`);
    CandidateTimeline.add(candidate.email, 'TEST_SUBMITTED', { hoursTaken: hoursTaken.toFixed(1), onTime: withinLimit });

    // v22.0: Auto portfolio scoring
    if (CONFIG.FEATURES.AUTO_PORTFOLIO_SCORING) {
      const portfolioUrl = sheet.getRange(candidate.row, CONFIG.COLUMNS.PORTFOLIO_URL).getValue();
      if (portfolioUrl) {
        Log.info('HANDLER', 'Auto-scoring portfolio', { name: candidate.name });
        const score = AI.scorePortfolio(portfolioUrl, candidate.role);
        if (score && !score.error) {
          SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_SCORE, score.score);
          SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_FEEDBACK, score.summary);
          CandidateTimeline.add(candidate.email, 'PORTFOLIO_SCORED', {
            score: score.score,
            recommendation: score.recommendation
          });
        }
      }
    }

    Notify.team(`📝 Test Submitted: ${candidate.name}`,
      `${candidate.name} submitted their ${candidate.role} test in ${hoursTaken.toFixed(1)} hours.`);
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.UNDER_REVIEW);
  }
}

function handleInterviewPending(candidate, sheet) {
  Log.info('HANDLER', 'Scheduling interview', { name: candidate.name });

  const interviewDate = sheet.getRange(candidate.row, CONFIG.COLUMNS.INTERVIEW_DATE).getValue();

  // v22.0: Create calendar event if date is set
  if (CONFIG.FEATURES.CALENDAR_INTEGRATION && interviewDate) {
    const calResult = Calendar.createInterview(candidate, new Date(interviewDate));
    if (calResult.success && calResult.eventId) {
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.CALENDAR_EVENT_ID, calResult.eventId);
      CandidateTimeline.add(candidate.email, 'CALENDAR_EVENT_CREATED', { eventId: calResult.eventId });
    }
  }

  // Send WhatsApp notification
  if (!candidate.phone) {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '⚠️ No phone');
    return;
  }

  const dateStr = interviewDate ? DateTime.formatIST(new Date(interviewDate), 'full') : 'TBD - Check your email for booking link';
  const result = WhatsApp.sendInterviewSchedule(candidate.phone, candidate.name, candidate.role, dateStr);

  if (result.success) {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '✅ Schedule sent');
    CandidateTimeline.add(candidate.email, 'INTERVIEW_SCHEDULED', { date: dateStr });

    // v22.0: Send portal link for self-booking if no date set
    if (!interviewDate && CONFIG.FEATURES.PORTAL_ENABLED) {
      sendPortalLink(candidate.email);
    }
  } else {
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `❌ Failed: ${result.error}`);
    // v22.0: Add to retry queue
    RetryQueue.add('WHATSAPP', {
      destination: candidate.phone,
      template: CONFIG.WHATSAPP.TEMPLATES.SCHEDULE,
      params: [candidate.name, candidate.role, dateStr]
    }, result.error);
  }
}

function handlePendingRejection(candidate, sheet) {
  const rejectAt = DateTime.addHours(new Date(), CONFIG.RULES.REJECTION_DELAY_HRS);
  SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `⏳ Will reject at ${DateTime.formatIST(rejectAt, 'full')}`);
  CandidateTimeline.add(candidate.email, 'REJECTION_QUEUED', { rejectAt: rejectAt.toISOString() });
}

function handleRejected(candidate, sheet) {
  const reason = sheet.getRange(candidate.row, CONFIG.COLUMNS.LOG).getValue() || 'application review';
  const rejectionText = AI.generateRejection(candidate.name, candidate.role, reason) || getDefaultRejectionText(candidate.name);

  if (candidate.email) {
    const rejectionHtml = EmailTemplates.wrap(`
      <h3>Application Update</h3>
      <p>Dear <strong>${candidate.name}</strong>,</p>
      <p>Thank you for taking the time to apply to Urbanmistrii and for your interest in the ${candidate.role} position.</p>
      <p>${rejectionText.replace(/\n/g, '<br>')}</p>
      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #3498db; margin: 25px 0;">
        <p style="margin: 0;">We encourage you to continue developing your skills and portfolio. Feel free to apply again in the future as new opportunities arise.</p>
      </div>
      <p>We wish you all the best in your career journey.</p>
      <p>Warm regards,<br><strong>Hiring Team, Urbanmistrii</strong></p>
    `);

    GmailApp.sendEmail(candidate.email, 'Thank you for applying to Urbanmistrii', rejectionText, {
      htmlBody: rejectionHtml,
      name: 'Urbanmistrii'
    });
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, 'Rejection sent');
    CandidateTimeline.add(candidate.email, 'REJECTION_SENT');
  }
}

function handleHired(candidate, sheet) {
  Log.success('HANDLER', 'Candidate hired!', { name: candidate.name });
  SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '🎉 Hired!');
  CandidateTimeline.add(candidate.email, 'HIRED', { role: candidate.role });
  Notify.team(`🎉 New Hire: ${candidate.name}`, `${candidate.name} has been hired for ${candidate.role} role.`);
}

function runOracleBackgroundCycle() {
  try {
    Log.info('CYCLE', 'Starting background cycle v22.0');

    // Core processing
    processInbox();
    processRejectionQueue();
    processFollowUps();

    // v22.0: New processors
    if (typeof RetryQueue !== 'undefined') {
      RetryQueue.process();
    }

    // Sync public view
    syncToPublicView();

    Log.success('CYCLE', 'Background cycle complete');
  } catch (e) {
    Log.critical('CYCLE', 'Background cycle failed', { error: e.message });
  }
}

function processRejectionQueue() {
  const candidates = SheetUtils.getCandidatesByStatus(CONFIG.RULES.STATUSES.PENDING_REJECTION);
  const now = new Date();
  for (const c of candidates) {
    const updated = c.data[CONFIG.COLUMNS.UPDATED - 1];
    if (DateTime.hoursBetween(updated, now) >= CONFIG.RULES.REJECTION_DELAY_HRS) {
      SheetUtils.updateCell(c.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.REJECTED);
    }
  }
}

function processFollowUps() {
  const candidates = SheetUtils.getCandidatesByStatus(CONFIG.RULES.STATUSES.TEST_SENT);
  const now = new Date();
  for (const c of candidates) {
    const testSent = c.data[CONFIG.COLUMNS.TEST_SENT - 1];
    if (!testSent) continue;
    const daysSince = DateTime.daysBetween(testSent, now);
    if (CONFIG.RULES.FOLLOWUP_DAYS.includes(daysSince) && c.data[CONFIG.COLUMNS.PHONE - 1]) {
      const phone = c.data[CONFIG.COLUMNS.PHONE - 1];
      const name = c.data[CONFIG.COLUMNS.NAME - 1];
      WhatsApp.sendReminder(phone, name, 'Reminder about test');

      // v22.1: Log to DB_FollowUp
      try {
        const followSheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.FOLLOWUP);
        followSheet.appendRow([new Date(), name, phone, 'WHATSAPP_REMINDER', 'SENT']);
      } catch (e) {
        Log.warn('FOLLOWUP', 'Failed to log follow-up', { error: e.message });
      }
    }
  }
}

function getSheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${CONFIG.SHEETS.MASTER_ID}`;
}

function getDefaultRejectionText(name) {
  return `Dear ${name},\n\nThank you for applying to UrbanMistrii. After careful review, we've decided to move forward with other candidates.\n\nBest regards,\nTeam UrbanMistrii`;
}

function scheduleFollowUp(candidate, days) {
  Log.info('SCHEDULE', `Follow-up scheduled for ${candidate.name} in ${days} days`);
}
