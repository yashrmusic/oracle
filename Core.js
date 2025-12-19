/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.1 - CORE ENGINE                       ║
 * ║                 Main Orchestrator & Automation Logic (Enhanced)               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

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
  const rejectionText = AI.generateRejection(candidate.name, candidate.role, reason);
  if (candidate.email) {
    Notify.email(candidate.email, `Thank you for applying to UrbanMistrii`, rejectionText || getDefaultRejectionText(candidate.name));
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, '✅ Rejection sent');
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
