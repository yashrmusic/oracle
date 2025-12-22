/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.1 - CANDIDATE PORTAL                  ║
 * ║                 Self-Service Web App for Candidates                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * Deploy: Publish → Deploy as web app
 * URL will be: https://script.google.com/macros/s/.../exec
 */

/**
 * Handle GET requests - serve the portal HTML
 */
function doGet(e) {
  try {
    // Hit Logger for debugging access issues
    Log.info('PORTAL_HIT', 'Request received', {
      token: e.parameter.token ? 'PRESENT' : 'MISSING',
      userAgent: e.parameter.ua || 'Unknown'
    });

    const token = e.parameter.token;

    if (!token) {
      return HtmlService.createHtmlOutput(Portal.getErrorPage(`No access token provided. Please use the Google Form for submission: <a href="${CONFIG.TEST_SUBMISSION_FORM_URL}">${CONFIG.TEST_SUBMISSION_FORM_URL}</a>`));
    }

    // Validate token and get candidate
    const candidate = Portal.validateToken(token);

    if (!candidate) {
      return HtmlService.createHtmlOutput(Portal.getErrorPage('Invalid or expired access token. Please contact HR.'));
    }

    // Serve the portal
    const html = Portal.generatePortalHtml(candidate, token);
    return HtmlService.createHtmlOutput(html)
      .setTitle('UrbanMistrii - Candidate Portal')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);

  } catch (err) {
    return HtmlService.createHtmlOutput(`
      <div style="font-family: sans-serif; padding: 50px; text-align: center;">
        <h1 style="color: #d32f2f;">🚨 Portal Runtime Error</h1>
        <p>The portal encountered a technical issue during load.</p>
        <pre style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: left; display: inline-block; margin-top: 20px;">
Error: ${err.message}
        </pre>
        <p style="margin-top: 20px; color: #666;">Please share this error message with the administrator.</p>
      </div>
    `);
  }
}

/**
 * Handle POST requests - form submissions
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    switch (data.action) {
      case 'uploadTest':
        return ContentService.createTextOutput(JSON.stringify(
          Portal.handleTestUpload(data.token, {
            pdfDocsUrl: data.pdfDocsUrl,
            dwgUrl: data.dwgUrl,
            otherFilesUrl: data.otherFilesUrl,
            testNotes: data.testNotes
          })
        )).setMimeType(ContentService.MimeType.JSON);

      case 'bookSlot':
        return ContentService.createTextOutput(JSON.stringify(
          Portal.handleSlotBooking(data.token, data.slotTime)
        )).setMimeType(ContentService.MimeType.JSON);

      case 'getSlots':
        return ContentService.createTextOutput(JSON.stringify(
          Portal.getAvailableSlots(data.date)
        )).setMimeType(ContentService.MimeType.JSON);

      default:
        return ContentService.createTextOutput(JSON.stringify({ error: 'Unknown action' }))
          .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ error: e.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

const Portal = {
  /**
   * Generate unique access token for a candidate
   */
  generateToken(email) {
    const token = Utilities.getUuid();

    // Find candidate and update token column
    const candidate = SheetUtils.findCandidateByEmail(email);
    if (candidate) {
      // Store token using configuration column
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTAL_TOKEN, token);

      Log.info('PORTAL', 'Token generated', { email: Sanitize.maskEmail(email) });
      return token;
    }

    return null;
  },

  /**
   * Validate token and return candidate data
   */
  validateToken(token) {
    try {
      const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
      const data = sheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        if (data[i][CONFIG.COLUMNS.PORTAL_TOKEN - 1] === token) { // Use constant
          return {
            row: i + 1,
            name: data[i][CONFIG.COLUMNS.NAME - 1],
            email: data[i][CONFIG.COLUMNS.EMAIL - 1],
            phone: data[i][CONFIG.COLUMNS.PHONE - 1],
            role: data[i][CONFIG.COLUMNS.ROLE - 1],
            status: data[i][CONFIG.COLUMNS.STATUS - 1],
            testSent: data[i][CONFIG.COLUMNS.TEST_SENT - 1],
            testSubmitted: data[i][CONFIG.COLUMNS.TEST_SUBMITTED - 1],
            interviewDate: data[i][CONFIG.COLUMNS.INTERVIEW_DATE - 1],
            portfolioScore: data[i][CONFIG.COLUMNS.PORTFOLIO_SCORE - 1]
          };
        }
      }

      return null;
    } catch (e) {
      Log.error('PORTAL', 'Token validation failed', { error: e.message });
      return null;
    }
  },

  /**
   * Handle test submission from portal with multiple file types
   * Tracks submission time vs allotted time
   */
  handleTestUpload(token, submissionData) {
    const candidate = this.validateToken(token);
    if (!candidate) return { success: false, error: 'Invalid token' };

    const {
      pdfDocsUrl,      // PDF/docs/design notes
      dwgUrl,          // DWG files
      otherFilesUrl,   // Other uploads
      testNotes        // Text notes
    } = submissionData;

    // Calculate time taken vs allotted
    const testSentTime = candidate.testSent;
    const submissionTime = new Date();
    let hoursTaken = null;
    let timeStatus = 'Unknown';

    if (testSentTime) {
      hoursTaken = DateTime.hoursBetween(new Date(testSentTime), submissionTime);
      const role = (candidate.role || '').toLowerCase();
      const timeLimit = CONFIG.RULES.TIME_LIMITS[role.includes('senior') ? 'senior' : role.includes('junior') ? 'junior' : 'intern'] || 2;
      timeStatus = hoursTaken <= timeLimit ? `ON TIME (${hoursTaken.toFixed(1)}h / ${timeLimit}h)` : `LATE (${hoursTaken.toFixed(1)}h / ${timeLimit}h)`;
    }

    // Combine all URLs for portfolio field
    const allUrls = [pdfDocsUrl, dwgUrl, otherFilesUrl].filter(Boolean).join(' | ');

    // Update candidate sheet
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_URL, allUrls);
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.TEST_SUBMITTED);
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.TEST_SUBMITTED, submissionTime);
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `📤 Portal: ${timeStatus}`);

    // Write to DB_TestSubmissions sheet
    try {
      let subSheet;
      try {
        subSheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.TEST_SUBMISSIONS);
      } catch (e) {
        // Create sheet if doesn't exist
        const ss = SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID);
        subSheet = ss.insertSheet(CONFIG.SHEETS.TABS.TEST_SUBMISSIONS);
        subSheet.appendRow([
          'Timestamp', 'Name', 'Email', 'Role', 'Phone',
          'PDF/Docs URL', 'DWG URL', 'Other Files', 'Test Notes',
          'Time Allotted (hrs)', 'Time Taken (hrs)', 'Status', 'Test Sent At'
        ]);
        subSheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
      }

      const role = (candidate.role || '').toLowerCase();
      const timeLimit = CONFIG.RULES.TIME_LIMITS[role.includes('senior') ? 'senior' : role.includes('junior') ? 'junior' : 'intern'] || 2;

      subSheet.appendRow([
        submissionTime,
        candidate.name,
        candidate.email,
        candidate.role,
        candidate.phone,
        pdfDocsUrl || '',
        dwgUrl || '',
        otherFilesUrl || '',
        testNotes || '',
        timeLimit,
        hoursTaken ? hoursTaken.toFixed(2) : '',
        timeStatus,
        testSentTime || ''
      ]);
    } catch (e) {
      Log.error('PORTAL', 'Failed to write to DB_TestSubmissions', { error: e.message });
    }

    // Trigger AI scoring if we have a portfolio URL
    if (pdfDocsUrl || dwgUrl) {
      const scoreUrl = pdfDocsUrl || dwgUrl;
      const score = AI.scorePortfolio(scoreUrl, candidate.role);
      if (score && score.score) {
        SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.AI_SCORE, score.score);
        SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_FEEDBACK, score.summary);
      }
    }

    CandidateTimeline.add(candidate.email, 'TEST_SUBMITTED_VIA_PORTAL', {
      pdfDocsUrl, dwgUrl, otherFilesUrl, timeStatus, hoursTaken
    });

    // Auto-forward email to admin with all details
    const adminEmailHtml = EmailTemplates.wrap(`
      <h3>Test Submission Received</h3>
      <p><strong>${candidate.name}</strong> has submitted their test via the portal.</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid ${timeStatus.includes('ON TIME') ? '#4caf50' : '#f44336'}; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Time Status:</strong> ${timeStatus}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${candidate.name}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${candidate.email}</td></tr>
        <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Role</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${candidate.role}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${candidate.phone || 'N/A'}</td></tr>
      </table>
      
      <h4>Submitted Files:</h4>
      <ul>
        ${pdfDocsUrl ? `<li><strong>PDF/Docs:</strong> <a href="${pdfDocsUrl}">${pdfDocsUrl}</a></li>` : ''}
        ${dwgUrl ? `<li><strong>DWG Files:</strong> <a href="${dwgUrl}">${dwgUrl}</a></li>` : ''}
        ${otherFilesUrl ? `<li><strong>Other:</strong> <a href="${otherFilesUrl}">${otherFilesUrl}</a></li>` : ''}
      </ul>
      
      ${testNotes ? `<h4>Candidate Notes:</h4><p style="background: #fff3e0; padding: 15px; border-radius: 8px;">${testNotes}</p>` : ''}
      
      <p style="margin-top: 20px;">
        ${EmailTemplates.button('REVIEW IN SHEET', getSheetUrl())}
      </p>
    `);

    GmailApp.sendEmail(
      CONFIG.TEAM.ADMIN_EMAIL,
      `Test Submission: ${candidate.name} - ${timeStatus}`,
      `${candidate.name} submitted their test. Time: ${timeStatus}. Review at: ${getSheetUrl()}`,
      { htmlBody: adminEmailHtml, name: 'Urbanmistrii Oracle' }
    );

    Log.success('PORTAL', 'Test submitted via portal', { name: candidate.name, timeStatus });

    return { success: true, message: 'Test submitted successfully! We will review and get back to you.' };
  },

  /**
   * Handle interview slot booking
   */
  handleSlotBooking(token, slotTime) {
    const candidate = this.validateToken(token);
    if (!candidate) return { success: false, error: 'Invalid token' };

    const dateTime = new Date(slotTime);

    // Create calendar event
    const calResult = Calendar.createInterview(candidate, dateTime);

    if (calResult.success) {
      // Update interview date in sheet
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.INTERVIEW_DATE, dateTime);
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.CALENDAR_EVENT_ID, calResult.eventId);
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `📅 Interview booked via portal: ${DateTime.formatIST(dateTime, 'full')}`);

      CandidateTimeline.add(candidate.email, 'INTERVIEW_BOOKED_VIA_PORTAL', { date: dateTime.toISOString() });

      Log.success('PORTAL', 'Interview booked via portal', { name: candidate.name, date: dateTime });

      return { success: true, message: `Interview booked for ${DateTime.formatIST(dateTime, 'full')}` };
    }

    return { success: false, error: calResult.error };
  },

  /**
   * Get available interview slots
   */
  getAvailableSlots(dateStr) {
    const date = new Date(dateStr);
    const slots = Calendar.getAvailableSlots(date);
    return { success: true, slots: slots };
  },

  /**
   * Generate portal HTML
   */
  generatePortalHtml(candidate, token) {
    const statusInfo = this.getStatusInfo(candidate.status);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UrbanMistrii - Candidate Portal</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    // SESSION FIXER: Automatically redirect if Google adds account hints (/u/n/)
    (function() {
      const url = window.location.href;
      if (url.includes('/u/') && !url.includes('?token=')) {
        // If it's a multi-session link but missing the token in current view, 
        // Or if it's just stuck in a loop, try to redirect to the clean config URL
        // with the token extracted from current search params
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (token) {
          window.location.host = 'script.google.com';
          const cleanPath = window.location.pathname.replace(/\/u\/\d+/, '');
          window.location.href = 'https://script.google.com' + cleanPath + '?token=' + token;
        }
      }
    })();
  </script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 20px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .logo { font-size: 28px; font-weight: 700; color: #667eea; }
    .welcome { color: #666; margin-top: 10px; }
    .status-banner {
      background: ${statusInfo.color};
      color: white;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 30px;
    }
    .status-icon { font-size: 48px; margin-bottom: 10px; }
    .status-text { font-size: 20px; font-weight: 600; }
    .status-desc { opacity: 0.9; margin-top: 8px; }
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 30px;
    }
    .info-item {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
    }
    .info-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .info-value { font-size: 16px; font-weight: 600; margin-top: 4px; }
    .section-title { font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #333; }
    .btn {
      background: #667eea;
      color: white;
      border: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(102,126,234,0.4); }
    .btn:disabled { background: #ccc; cursor: not-allowed; transform: none; }
    .form-group { margin-bottom: 20px; }
    label { display: block; font-weight: 500; margin-bottom: 8px; }
    input, textarea, select {
      width: 100%;
      padding: 12px;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: #667eea;
    }
    .timeline {
      border-left: 3px solid #667eea;
      padding-left: 20px;
    }
    .timeline-item {
      position: relative;
      padding-bottom: 20px;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: -26px;
      top: 0;
      width: 12px;
      height: 12px;
      background: #667eea;
      border-radius: 50%;
    }
    .timeline-item.completed::before { background: #4caf50; }
    .timeline-item.current::before { background: #ff9800; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.3); } }
    .message { padding: 16px; border-radius: 8px; margin-top: 16px; }
    .message.success { background: #e8f5e9; color: #2e7d32; }
    .message.error { background: #ffebee; color: #c62828; }
    .hidden { display: none; }
    .footer { text-align: center; color: rgba(255,255,255,0.7); margin-top: 20px; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">🏠 UrbanMistrii</div>
        <div class="welcome">Welcome, ${candidate.name}!</div>
      </div>
      
      <div class="status-banner">
        <div class="status-icon">${statusInfo.icon}</div>
        <div class="status-text">${statusInfo.title}</div>
        <div class="status-desc">${statusInfo.description}</div>
      </div>
      
      <div class="info-grid">
        <div class="info-item">
          <div class="info-label">Role</div>
          <div class="info-value">${candidate.role || 'Designer'}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Email</div>
          <div class="info-value">${candidate.email}</div>
        </div>
        <div class="info-item">
          <div class="info-label">Status</div>
          <div class="info-value">${candidate.status}</div>
        </div>
        ${candidate.portfolioScore ? `
        <div class="info-item">
          <div class="info-label">Portfolio Score</div>
          <div class="info-value">${candidate.portfolioScore}/10</div>
        </div>
        ` : ''}
      </div>
      
      <!-- Test Upload Section -->
      <div id="testUploadSection" class="${this.shouldShowTestUpload(candidate.status) ? '' : 'hidden'}">
        <h3 class="section-title">📤 Submit Your Test</h3>
        <p style="color: #666; margin-bottom: 20px;">Upload your test files by providing links to Google Drive, Dropbox, or any file sharing service. Make sure the links are accessible (set to "Anyone with link can view").</p>
        
        <form id="testForm">
          <div class="form-group">
            <label>📄 PDF/Documents/Design Notes *</label>
            <input type="url" id="pdfDocsUrl" placeholder="https://drive.google.com/..." required>
            <small style="color: #888;">Presentation, design notes, PDFs (required)</small>
          </div>
          
          <div class="form-group">
            <label>📐 DWG/CAD Files</label>
            <input type="url" id="dwgUrl" placeholder="https://drive.google.com/...">
            <small style="color: #888;">AutoCAD, DWG files (if applicable)</small>
          </div>
          
          <div class="form-group">
            <label>📁 Other Supporting Files</label>
            <input type="url" id="otherFilesUrl" placeholder="https://...">
            <small style="color: #888;">Any other files - 3D renders, references, etc.</small>
          </div>
          
          <div class="form-group">
            <label>📝 Test Notes</label>
            <textarea id="testNotes" rows="4" placeholder="Describe your approach, any challenges faced, or additional context about your submission..."></textarea>
          </div>
          
          <button type="submit" class="btn">🚀 Submit Test</button>
        </form>
        <div id="testMessage" class="message hidden"></div>
      </div>
      
      <!-- Interview Booking Section -->
      <div id="interviewSection" class="${this.shouldShowInterviewBooking(candidate.status) ? '' : 'hidden'}">
        <h3 class="section-title">📅 Book Your Interview</h3>
        <form id="interviewForm">
          <div class="form-group">
            <label>Select Date</label>
            <input type="date" id="interviewDate" min="${new Date().toISOString().split('T')[0]}" required>
          </div>
          <div class="form-group">
            <label>Available Slots</label>
            <select id="slotSelect" disabled>
              <option>Select a date first</option>
            </select>
          </div>
          <button type="submit" class="btn" id="bookBtn" disabled>Book Interview</button>
        </form>
        <div id="interviewMessage" class="message hidden"></div>
      </div>
    </div>
    
    <div class="footer">
      UrbanMistrii Candidate Portal • Powered by Oracle v22.0
    </div>
  </div>
  
  <script>
    const TOKEN = '${token}';
    const API_URL = '${CONFIG.PORTAL_URL}';
    
    // Test submission
    document.getElementById('testForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = '⏳ Submitting...';
      
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'uploadTest',
            token: TOKEN,
            pdfDocsUrl: document.getElementById('pdfDocsUrl').value,
            dwgUrl: document.getElementById('dwgUrl').value || '',
            otherFilesUrl: document.getElementById('otherFilesUrl').value || '',
            testNotes: document.getElementById('testNotes').value || ''
          })
        });
        const data = await res.json();
        showMessage('testMessage', data.success, data.message || data.error);
        if (data.success) {
          e.target.classList.add('hidden');
          // Show success animation
          document.getElementById('testUploadSection').innerHTML = '<div style="text-align: center; padding: 40px;"><div style="font-size: 64px;">✅</div><h3>Test Submitted Successfully!</h3><p>We will review your submission and get back to you soon.</p></div>';
        }
      } catch (err) {
        showMessage('testMessage', false, err.message);
      }
      
      btn.disabled = false;
      btn.textContent = '🚀 Submit Test';
    });
    
    // Date selection for interview
    document.getElementById('interviewDate')?.addEventListener('change', async (e) => {
      const select = document.getElementById('slotSelect');
      const btn = document.getElementById('bookBtn');
      select.innerHTML = '<option>Loading...</option>';
      
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'getSlots', date: e.target.value })
        });
        const data = await res.json();
        
        if (data.slots && data.slots.length > 0) {
          select.innerHTML = data.slots.map(s => 
            '<option value="' + s.start + '">' + s.label + '</option>'
          ).join('');
          select.disabled = false;
          btn.disabled = false;
        } else {
          select.innerHTML = '<option>No slots available</option>';
        }
      } catch (err) {
        select.innerHTML = '<option>Error loading slots</option>';
      }
    });
    
    // Interview booking
    document.getElementById('interviewForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('bookBtn');
      btn.disabled = true;
      btn.textContent = 'Booking...';
      
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'bookSlot',
            token: TOKEN,
            slotTime: document.getElementById('slotSelect').value
          })
        });
        const data = await res.json();
        showMessage('interviewMessage', data.success, data.message || data.error);
        if (data.success) {
          e.target.classList.add('hidden');
        }
      } catch (err) {
        showMessage('interviewMessage', false, err.message);
      }
      
      btn.textContent = 'Book Interview';
    });
    
    function showMessage(id, success, text) {
      const el = document.getElementById(id);
      el.className = 'message ' + (success ? 'success' : 'error');
      el.textContent = text;
      el.classList.remove('hidden');
    }
  </script>
</body>
</html>
    `;
  },

  /**
   * Get status display info
   */
  getStatusInfo(status) {
    const info = {
      [CONFIG.RULES.STATUSES.NEW]: { icon: '📋', title: 'Application Received', description: 'We are reviewing your application', color: '#2196f3' },
      [CONFIG.RULES.STATUSES.IN_PROCESS]: { icon: '⏳', title: 'In Process', description: 'Your application is being processed', color: '#ff9800' },
      [CONFIG.RULES.STATUSES.TEST_SENT]: { icon: '📝', title: 'Test Assigned', description: 'Please complete and submit your test', color: '#9c27b0' },
      [CONFIG.RULES.STATUSES.TEST_SUBMITTED]: { icon: '✅', title: 'Test Submitted', description: 'We received your test and are reviewing it', color: '#4caf50' },
      [CONFIG.RULES.STATUSES.UNDER_REVIEW]: { icon: '🔍', title: 'Under Review', description: 'Your work is being evaluated', color: '#607d8b' },
      [CONFIG.RULES.STATUSES.INTERVIEW_PENDING]: { icon: '📅', title: 'Interview Pending', description: 'Book your interview slot below', color: '#e91e63' },
      [CONFIG.RULES.STATUSES.INTERVIEW_DONE]: { icon: '🎯', title: 'Interview Complete', description: 'We will share the decision soon', color: '#673ab7' },
      [CONFIG.RULES.STATUSES.HIRED]: { icon: '🎉', title: 'Congratulations!', description: 'Welcome to the UrbanMistrii team!', color: '#4caf50' },
      [CONFIG.RULES.STATUSES.REJECTED]: { icon: '💔', title: 'Not Selected', description: 'Thank you for your interest', color: '#9e9e9e' }
    };

    return info[status] || { icon: '📋', title: status, description: '', color: '#2196f3' };
  },

  shouldShowTestUpload(status) {
    return status === CONFIG.RULES.STATUSES.TEST_SENT;
  },

  shouldShowInterviewBooking(status) {
    return status === CONFIG.RULES.STATUSES.INTERVIEW_PENDING;
  },

  getErrorPage(message) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Error - UrbanMistrii Portal</title>
  <style>
    body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f5f5f5; }
    .error { text-align: center; padding: 40px; background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
    .error h1 { color: #e53935; margin-bottom: 16px; }
    .error p { color: #666; }
  </style>
</head>
<body>
  <div class="error">
    <h1>⚠️ Access Error</h1>
    <p>${message}</p>
    <div id="sessionFix" style="display:none; margin-top:20px; padding:15px; background:#fff3e0; border-radius:8px;">
      <p style="font-size:14px; margin-bottom:10px;">Having trouble? Try the clean link:</p>
      <button onclick="fixSession()" style="background:#e67e22; color:white; border:none; padding:10px 20px; border-radius:5px; cursor:pointer;">FIX SESSION & RELOAD</button>
    </div>
    <p style="margin-top: 20px;"><a href="mailto:${CONFIG.TEAM.ADMIN_EMAIL}">Contact HR</a></p>
  </div>
  <script>
    const url = window.location.href;
    if (url.includes('/u/')) {
      document.getElementById('sessionFix').style.display = 'block';
    }
    
    function fixSession() {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');
      const cleanUrl = 'https://script.google.com/macros/s/AKfycbyaZbGMBNM33g-fu3uFBWWXP_WsRdS7nuHpqzq8dsIfE-dGfMoZo2t0y2R5Aqeyaq1sVw/exec' + (token ? '?token=' + token : '');
      window.top.location.href = cleanUrl;
    }
  </script>
</body>
</html>
    `;
  }
};

/**
 * Send portal link to a candidate
 */
function sendPortalLink(email) {
  const token = Portal.generateToken(email);
  if (!token) {
    Logger.log('Failed to generate token for ' + email);
    return false;
  }

  const portalUrl = CONFIG.PORTAL_URL + '?token=' + token;

  Notify.email(
    email,
    '🔗 Your UrbanMistrii Candidate Portal',
    `Hello!

You now have access to your personal candidate portal where you can:
• Check your application status
• Submit your test
• Book interview slots

Access your portal here:
${portalUrl}

This link is unique to you - do not share it.

Best regards,
Team UrbanMistrii`
  );

  Log.success('PORTAL', 'Portal link sent', { email: Sanitize.maskEmail(email) });
  return true;
}

/**
 * Test portal - generates a test link for the first TEST_SENT candidate
 * Run this function to get a working portal URL
 */
function testPortal() {
  Logger.log('╔═══════════════════════════════════════════════════════════════════╗');
  Logger.log('║         PORTAL TEST - GENERATING TEST LINK                        ║');
  Logger.log('╚═══════════════════════════════════════════════════════════════════╝');

  const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
  const data = sheet.getDataRange().getValues();

  // Find first TEST_SENT candidate or first candidate with email
  let testCandidate = null;
  let testRow = null;

  for (let i = 1; i < data.length; i++) {
    const status = data[i][CONFIG.COLUMNS.STATUS - 1];
    const email = data[i][CONFIG.COLUMNS.EMAIL - 1];
    const name = data[i][CONFIG.COLUMNS.NAME - 1];

    if (email && (status === CONFIG.RULES.STATUSES.TEST_SENT || !testCandidate)) {
      testCandidate = { email, name, status, row: i + 1 };
      testRow = i + 1;
      if (status === CONFIG.RULES.STATUSES.TEST_SENT) break; // Prefer TEST_SENT candidates
    }
  }

  if (!testCandidate) {
    Logger.log('❌ No candidates found in sheet!');
    return;
  }

  Logger.log(`\n📋 Testing with: ${testCandidate.name} (${testCandidate.email})`);
  Logger.log(`   Status: ${testCandidate.status}`);

  // Generate or get existing token
  let token = data[testRow - 1][CONFIG.COLUMNS.PORTAL_TOKEN - 1];

  if (!token) {
    token = Portal.generateToken(testCandidate.email);
    Logger.log('🔑 Generated new token');
  } else {
    Logger.log('🔑 Using existing token');
  }

  // Build portal URL
  const baseUrl = CONFIG.PORTAL_URL;
  const portalUrl = baseUrl + '?token=' + token;

  Logger.log('\n════════════════════════════════════════════════════════════════════');
  Logger.log('✅ PORTAL TEST URL:');
  Logger.log(portalUrl);
  Logger.log('════════════════════════════════════════════════════════════════════');
  Logger.log('\nOpen this URL in your browser to test the portal.');
  Logger.log('(The candidate will see their status and can submit test if status is TEST_SENT)');
}

/**
 * Generate portal link for a specific email address
 * @param {string} email - Candidate email to generate link for
 */
function generatePortalLinkFor(email) {
  if (!email) {
    Logger.log('Usage: generatePortalLinkFor("candidate@email.com")');
    return;
  }

  const token = Portal.generateToken(email);
  if (!token) {
    Logger.log('❌ Candidate not found: ' + email);
    return;
  }

  const baseUrl = CONFIG.PORTAL_URL;
  const portalUrl = baseUrl + '?token=' + token;

  Logger.log('✅ Portal link for ' + email + ':');
  Logger.log(portalUrl);
}

/**
 * QUICK TEST: Send portal link to Yash for testing
 * Run this function directly!
 */
/**
 * QUICK TEST: Send test links to Yash
 */
function sendOracleTestToYash() {
  const email = 'iamyash95@gmail.com';
  const roles = [
    { name: 'Intern', role: 'intern' },
    { name: 'Junior', role: 'junior' },
    { name: 'Senior', role: 'senior' }
  ];

  roles.forEach(item => {
    const testLink = ConfigHelpers.getTestLink(item.role, 'DESIGN');
    const timeLimit = ConfigHelpers.getTimeLimit(item.role, 'DESIGN');
    const submissionFormUrl = CONFIG.TEST_SUBMISSION_FORM_URL;

    const html = EmailTemplates.wrap(`
      <h3>UrbanMistrii - ${item.name} Assessment</h3>
      <p>Hello Yash,</p>
      <p>Here is your selection for the <strong>${item.name} Designer</strong> assessment.</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #4285f4; margin: 20px 0;">
        <p style="margin-bottom: 15px;"><strong>Assignment Link:</strong></p>
        ${EmailTemplates.button('DOWNLOAD ASSESSMENT', testLink)}
        <p><strong>Time Limit:</strong> ${timeLimit} hours</p>
      </div>

      <h4>Submission Instructions:</h4>
      <p>Once you complete your test, please upload all your files via the official submission form below:</p>
      
      ${EmailTemplates.button('SUBMIT YOUR TEST', submissionFormUrl)}

      <p style="color: #666; font-size: 12px; margin-top: 20px;">
        Note: This is an automated test email for the Oracle system verification.
      </p>
    `);

    GmailApp.sendEmail(email, `[TEST] ${item.name} Assessment - UrbanMistrii`,
      `Test your ${item.name} assessment: ${testLink}\nSubmit here: ${submissionFormUrl}`,
      { htmlBody: html, name: 'Urbanmistrii Oracle' });

    Logger.log(`Sent ${item.name} test to ${email}`);
  });

  Logger.log('\n====================================================================');
  Logger.log('DONE! Checked iamyash95@gmail.com for both tests.');
  Logger.log('====================================================================');
}
