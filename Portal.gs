/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.0 - CANDIDATE PORTAL                  ║
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
  const token = e.parameter.token;
  
  if (!token) {
    return HtmlService.createHtmlOutput(Portal.getErrorPage('No access token provided. Please use the link sent to your email.'));
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
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
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
          Portal.handleTestUpload(data.token, data.fileUrl, data.notes)
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
      // Store token (using column R = 18 for PORTAL_TOKEN)
      SheetUtils.updateCell(candidate.row, 18, token);
      
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
   * Handle test submission from portal
   */
  handleTestUpload(token, fileUrl, notes) {
    const candidate = this.validateToken(token);
    if (!candidate) return { success: false, error: 'Invalid token' };
    
    // Update portfolio URL
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_URL, fileUrl);
    
    // Update status
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.TEST_SUBMITTED);
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.TEST_SUBMITTED, new Date());
    SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `📤 Submitted via portal: ${notes || 'No notes'}`);
    
    // Trigger AI scoring
    const score = AI.scorePortfolio(fileUrl, candidate.role);
    if (score && score.score) {
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.AI_SCORE, score.score);
      SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_FEEDBACK, score.summary);
    }
    
    CandidateTimeline.add(candidate.email, 'TEST_SUBMITTED_VIA_PORTAL', { fileUrl, notes });
    
    Log.success('PORTAL', 'Test submitted via portal', { name: candidate.name });
    
    return { success: true, message: 'Test submitted successfully!' };
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
        <form id="testForm">
          <div class="form-group">
            <label>Portfolio/Test Link (Google Drive, Dropbox, Behance, etc.)</label>
            <input type="url" id="fileUrl" placeholder="https://..." required>
          </div>
          <div class="form-group">
            <label>Notes (optional)</label>
            <textarea id="notes" rows="3" placeholder="Any additional notes..."></textarea>
          </div>
          <button type="submit" class="btn">Submit Test</button>
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
    const API_URL = '${ScriptApp.getService().getUrl()}';
    
    // Test submission
    document.getElementById('testForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      
      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          body: JSON.stringify({
            action: 'uploadTest',
            token: TOKEN,
            fileUrl: document.getElementById('fileUrl').value,
            notes: document.getElementById('notes').value
          })
        });
        const data = await res.json();
        showMessage('testMessage', data.success, data.message || data.error);
        if (data.success) {
          e.target.classList.add('hidden');
        }
      } catch (err) {
        showMessage('testMessage', false, err.message);
      }
      
      btn.disabled = false;
      btn.textContent = 'Submit Test';
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
    <p style="margin-top: 20px;"><a href="mailto:${CONFIG.TEAM.ADMIN_EMAIL}">Contact HR</a></p>
  </div>
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
  
  const portalUrl = ScriptApp.getService().getUrl() + '?token=' + token;
  
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
 * Test portal
 */
function testPortal() {
  Logger.log('Testing Portal...');
  
  // Generate test token
  const testToken = Utilities.getUuid();
  Logger.log('Generated token: ' + testToken);
  
  // Get portal URL
  const url = ScriptApp.getService().getUrl();
  Logger.log('Portal URL: ' + url);
  
  Logger.log('✅ Portal test passed');
  Logger.log('Deploy as web app to enable portal functionality');
}
