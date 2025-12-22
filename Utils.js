/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                     URBANMISTRII ORACLE v21.0 - UTILS                         ║
 * ║                     Logging, Helpers & Core Utilities                         ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════════
//                              LOGGING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

const Log = {
  /**
   * internal helper to append to log sheet
   */
  _append(level, category, message, data = null) {
    try {
      const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.LOGS);
      const timestamp = new Date();
      const dataStr = data ? JSON.stringify(data) : '';

      sheet.appendRow([timestamp, level, category, message, dataStr]);

      // Also log to console for debugging
      const icon = level === 'ERROR' || level === 'CRITICAL' ? '❌'
        : level === 'SUCCESS' ? '✅'
          : level === 'WARN' ? '⚠️'
            : 'ℹ️';

      Logger.log(`${icon} [${level}] ${category}: ${message} ${dataStr}`);

    } catch (e) {
      Logger.log(`🚨 LOGGING FAILED: ${e.message}`);
    }
  },

  info(category, message, data) {
    this._append('INFO', category, message, data);
  },

  success(category, message, data) {
    this._append('SUCCESS', category, message, data);
  },

  warn(category, message, data) {
    this._append('WARN', category, message, data);
  },

  error(category, message, data) {
    this._append('ERROR', category, message, data);
  },

  critical(category, message, data) {
    this._append('CRITICAL', category, message, data);
    // Critical errors also email the admin immediately
    Notify.email(
      CONFIG.TEAM.ADMIN_EMAIL,
      `🚨 CRITICAL ERROR: ${category}`,
      `Message: ${message}\nData: ${JSON.stringify(data, null, 2)}`
    );
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              DATE & TIME HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const DateTime = {
  getIST(date = new Date()) {
    const str = date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
    return new Date(str);
  },

  hoursBetween(d1, d2) {
    return Math.abs(d2 - d1) / 36e5;
  },

  daysBetween(d1, d2) {
    return Math.floor(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24));
  },

  addHours(date, hours) {
    const copy = new Date(date);
    copy.setTime(copy.getTime() + (hours * 60 * 60 * 1000));
    return copy;
  },

  addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  },

  formatIST(date, format = 'short') {
    if (!date) return '';
    const options = { timeZone: 'Asia/Kolkata' };

    if (format === 'full') {
      return date.toLocaleString('en-IN', {
        ...options,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return date.toLocaleDateString('en-IN', options);
  }
};

/**
 * Generate Google Calendar link for an event
 */
function generateCalendarLink(name, role, dateInput, timeInput) {
  try {
    let startDate = new Date();

    // Try to parse the date
    if (dateInput instanceof Date) {
      startDate = new Date(dateInput);
    } else if (typeof dateInput === 'string') {
      // Try to parse string date
      const parsed = new Date(dateInput);
      if (!isNaN(parsed.getTime())) {
        startDate = parsed;
      } else {
        // Default to tomorrow if unparseable
        startDate = DateTime.addDays(new Date(), 1);
        startDate.setHours(10, 0, 0, 0);
      }
    }

    // Parse time if provided
    if (timeInput) {
      if (timeInput instanceof Date) {
        startDate.setHours(timeInput.getHours(), timeInput.getMinutes());
      } else if (typeof timeInput === 'string') {
        const timeMatch = timeInput.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          const mins = parseInt(timeMatch[2]) || 0;
          const ampm = timeMatch[3];
          if (ampm && ampm.toLowerCase() === 'pm' && hours < 12) hours += 12;
          if (ampm && ampm.toLowerCase() === 'am' && hours === 12) hours = 0;
          startDate.setHours(hours, mins, 0, 0);
        }
      }
    }

    // Calculate end time (45 minutes later)
    const endDate = new Date(startDate.getTime() + 45 * 60 * 1000);

    // Format dates for Google Calendar URL
    const formatGCalDate = (d) => {
      return d.toISOString().replace(/-|:|\.\d{3}/g, '').slice(0, -1) + 'Z';
    };

    const title = encodeURIComponent(`Urbanmistrii Interview - ${role}`);
    const details = encodeURIComponent(`Interview with ${name} for ${role} position at Urbanmistrii.\n\nPlease have your portfolio ready.`);
    const location = encodeURIComponent('Online / Video Call');

    return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatGCalDate(startDate)}/${formatGCalDate(endDate)}&details=${details}&location=${location}`;

  } catch (e) {
    // Return a basic calendar link if parsing fails
    return 'https://calendar.google.com';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                          EMAIL TEMPLATES (v9.1 Style)
// ═══════════════════════════════════════════════════════════════════════════════

const EmailTemplates = {
  // Shared styles
  _styles: {
    container: 'max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; color: #333333;',
    header: 'background-color: #1a1a1a; padding: 30px 40px; text-align: left; border-bottom: 4px solid #e74c3c;',
    logo: 'color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 2px; margin: 0; text-transform: uppercase;',
    body: 'padding: 40px; line-height: 1.6; font-size: 15px;',
    button: 'display: inline-block; background-color: #e74c3c; color: #ffffff !important; padding: 14px 30px; text-decoration: none; font-weight: 600; border-radius: 2px;',
    infoBox: 'background-color: #f9f9f9; padding: 20px; border-left: 4px solid #e74c3c; margin: 25px 0;',
    warningBox: 'background-color: #fff3cd; padding: 15px; border-left: 4px solid #f39c12; margin: 20px 0;',
    footer: 'background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #888;'
  },

  /**
   * Wrap content in the standard UrbanMistrii email template
   */
  wrap(content) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; background-color: #f4f4f4; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;">
  <div style="${this._styles.container}">
    <div style="${this._styles.header}">
      <h1 style="${this._styles.logo}">URBANMISTRII</h1>
    </div>
    <div style="${this._styles.body}">
      ${content}
    </div>
    <div style="${this._styles.footer}">
      &copy; ${new Date().getFullYear()} Urbanmistrii. All Rights Reserved.
    </div>
  </div>
</body>
</html>`;
  },

  /**
   * Create a styled button
   */
  button(text, url) {
    return `<div style="text-align: center; margin: 25px 0;"><a href="${url}" style="${this._styles.button}">${text}</a></div>`;
  },

  /**
   * Create an info box
   */
  infoBox(content) {
    return `<div style="${this._styles.infoBox}">${content}</div>`;
  },

  /**
   * Create a warning box
   */
  warningBox(content) {
    return `<div style="${this._styles.warningBox}">${content}</div>`;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              SHEET UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const SheetUtils = {
  updateCell(row, col, value) {
    const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
    sheet.getRange(row, col).setValue(value);
  },

  findCandidateByEmail(email) {
    const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
    const data = sheet.getDataRange().getValues();
    const emailColIndex = CONFIG.COLUMNS.EMAIL - 1;

    for (let i = 1; i < data.length; i++) {
      if (typeof data[i][emailColIndex] === 'string' &&
        data[i][emailColIndex].toLowerCase() === email.toLowerCase()) {
        return {
          row: i + 1,
          data: data[i]
        };
      }
    }
    return null;
  },

  getCandidatesByStatus(status) {
    const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
    const data = sheet.getDataRange().getValues();
    const statusIdx = CONFIG.COLUMNS.STATUS - 1;
    const matches = [];

    for (let i = 1; i < data.length; i++) {
      if (data[i][statusIdx] === status) {
        matches.push({
          row: i + 1,
          data: data[i]
        });
      }
    }
    return matches;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

const Validate = {
  phone(phone) {
    // Basic India validation
    const regex = /^(?:\+91|91)?[6-9]\d{9}$/;
    const str = String(phone).replace(/\D/g, '');
    const valid = regex.test(str) || str.length === 10;
    return { valid, cleaned: str };
  },

  email(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return { valid: regex.test(email) };
  },

  name(name) {
    return { valid: name && name.length >= 2 };
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              SANITIZATION
// ═══════════════════════════════════════════════════════════════════════════════

const Sanitize = {
  maskEmail(email) {
    if (!email) return '';
    const parts = email.split('@');
    if (parts.length < 2) return email;
    const name = parts[0];
    const visible = name.substring(0, 3);
    return `${visible}***@${parts[1]}`;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

const Duplicates = {
  /**
   * Check if a candidate already exists (fuzzy matching)
   * @param {string} email - Candidate email
   * @param {string} phone - Candidate phone
   * @param {string} name - Candidate name
   * @returns {object} { isDuplicate, existingRow, similarity, matchType }
   */
  check(email, phone, name) {
    try {
      const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
      const data = sheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        const existingEmail = String(data[i][CONFIG.COLUMNS.EMAIL - 1] || '').toLowerCase();
        const existingPhone = String(data[i][CONFIG.COLUMNS.PHONE - 1] || '').replace(/\D/g, '');
        const existingName = String(data[i][CONFIG.COLUMNS.NAME - 1] || '').toLowerCase();

        // Exact email match
        if (email && existingEmail && email.toLowerCase() === existingEmail) {
          return {
            isDuplicate: true,
            existingRow: i + 1,
            existingData: data[i],
            similarity: 1.0,
            matchType: 'EMAIL_EXACT'
          };
        }

        // Exact phone match (last 10 digits)
        const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
        const cleanExisting = existingPhone.slice(-10);
        if (cleanPhone.length === 10 && cleanPhone === cleanExisting) {
          return {
            isDuplicate: true,
            existingRow: i + 1,
            existingData: data[i],
            similarity: 1.0,
            matchType: 'PHONE_EXACT'
          };
        }

        // Fuzzy name match (using Levenshtein distance)
        if (name && existingName) {
          const similarity = this._nameSimilarity(name.toLowerCase(), existingName);
          if (similarity > 0.85) {
            // Also check if phone partially matches
            const phonePartial = cleanPhone.length >= 6 && cleanExisting.includes(cleanPhone.slice(-6));
            if (phonePartial || similarity > 0.95) {
              return {
                isDuplicate: true,
                existingRow: i + 1,
                existingData: data[i],
                similarity: similarity,
                matchType: 'NAME_FUZZY'
              };
            }
          }
        }
      }

      return { isDuplicate: false };

    } catch (e) {
      Log.error('DUPLICATES', 'Check failed', { error: e.message });
      return { isDuplicate: false, error: e.message };
    }
  },

  /**
   * Calculate name similarity using Levenshtein distance
   */
  _nameSimilarity(name1, name2) {
    // Normalize names
    const n1 = name1.replace(/[^a-z\s]/g, '').trim();
    const n2 = name2.replace(/[^a-z\s]/g, '').trim();

    if (n1 === n2) return 1.0;
    if (!n1 || !n2) return 0.0;

    const distance = this._levenshtein(n1, n2);
    const maxLen = Math.max(n1.length, n2.length);
    return 1 - (distance / maxLen);
  },

  /**
   * Levenshtein distance algorithm
   */
  _levenshtein(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  },

  /**
   * Get duplicate response message for candidates
   */
  getResponse(existingData) {
    const status = existingData[CONFIG.COLUMNS.STATUS - 1];
    const name = existingData[CONFIG.COLUMNS.NAME - 1];

    return `Hi ${name},

We found that you've already applied to UrbanMistrii! 

Your current application status is: **${status}**

If you have any questions about your application, please reply to this email.

Best regards,
Team UrbanMistrii`;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

const Notify = {
  /**
   * Send plain text email
   */
  email(to, subject, body, options = {}) {
    if (SecureConfig.isTestMode() && !to.includes("test")) {
      Logger.log(`[TEST MODE] Would email ${to}: ${subject}`);
      return;
    }
    GmailApp.sendEmail(to, subject, body, options);
  },

  /**
   * Send branded HTML email using UrbanMistrii template
   */
  emailHtml(to, subject, htmlContent, plainTextFallback = '') {
    if (SecureConfig.isTestMode() && !to.includes("test")) {
      Logger.log(`[TEST MODE] Would email ${to}: ${subject}`);
      return;
    }

    const htmlBody = EmailTemplates.wrap(htmlContent);
    const plainBody = plainTextFallback || htmlContent.replace(/<[^>]*>/g, '').trim();

    GmailApp.sendEmail(to, subject, plainBody, {
      htmlBody: htmlBody,
      name: 'Urbanmistrii'
    });
  },

  /**
   * Send to team with branded template
   */
  team(subject, body) {
    const emails = CONFIG.TEAM.TEAM_EMAILS.join(',');
    this.email(emails, subject, body);
  },

  /**
   * Send branded team notification
   */
  teamHtml(subject, htmlContent) {
    const emails = CONFIG.TEAM.TEAM_EMAILS.join(',');
    this.emailHtml(emails, subject, htmlContent);
  },

  /**
   * Daily summary with beautiful HTML template
   */
  dailySummary(stats) {
    const htmlContent = `
      <h3>Daily Recruitment Summary</h3>
      <p style="color: #666; margin-bottom: 25px;">${new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #e74c3c; margin: 25px 0;">
        <h4 style="margin: 0 0 15px 0; color: #1a1a1a;">Overview</h4>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Total Candidates</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${stats.total}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">New Today</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; text-align: right; color: #27ae60;">${stats.new}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Hired</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; text-align: right; color: #27ae60;">${stats.hired}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Rejected</td>
            <td style="padding: 8px 0; font-weight: bold; text-align: right; color: #e74c3c;">${stats.rejected}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid #3498db; margin: 25px 0;">
        <h4 style="margin: 0 0 15px 0; color: #1a1a1a;">Pipeline Status</h4>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Tests Sent</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${stats.testsSent}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">Tests Submitted</td>
            <td style="padding: 8px 0; border-bottom: 1px solid #eee; font-weight: bold; text-align: right;">${stats.testsSubmitted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">Interviews</td>
            <td style="padding: 8px 0; font-weight: bold; text-align: right;">${stats.interviews}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #e8f5e9; padding: 20px; border-left: 4px solid #27ae60; margin: 25px 0;">
        <h4 style="margin: 0 0 15px 0; color: #1a1a1a;">Performance</h4>
        <p style="margin: 0 0 10px 0;"><strong>Conversion Rate:</strong> ${stats.conversionRate}%</p>
        <p style="margin: 0;"><strong>Avg Response Time:</strong> ${stats.avgResponseTime}</p>
      </div>
    `;

    const plainBody = `
DAILY RECRUITMENT SUMMARY
${new Date().toLocaleDateString()}

OVERVIEW
- Total Candidates: ${stats.total}
- New Today: ${stats.new}
- Hired: ${stats.hired}
- Rejected: ${stats.rejected}

PIPELINE
- Tests Sent: ${stats.testsSent}
- Tests Submitted: ${stats.testsSubmitted}
- Interviews: ${stats.interviews}

PERFORMANCE
- Conversion Rate: ${stats.conversionRate}%
- Avg Response: ${stats.avgResponseTime}
`;

    const emails = CONFIG.TEAM.TEAM_EMAILS.join(',');
    const htmlBody = EmailTemplates.wrap(htmlContent);

    GmailApp.sendEmail(emails, `Daily Hiring Analytics - ${new Date().toLocaleDateString()}`, plainBody, {
      htmlBody: htmlBody,
      name: 'Urbanmistrii Oracle'
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              TEST UTILS
// ═══════════════════════════════════════════════════════════════════════════════

const Test = {
  runAll() {
    Logger.log('Running Utils tests...');

    // DateTime
    const now = new Date();
    const later = DateTime.addHours(now, 2);
    if (DateTime.hoursBetween(now, later) !== 2) throw new Error('DateTime.addHours fail');

    // Validate
    if (!Validate.phone('9999999999').valid) throw new Error('Validate.phone fail');

    // Sanitize
    if (Sanitize.maskEmail('testing@example.com') !== 'tes***@example.com') throw new Error('Sanitize fail');

    Logger.log('✅ Utils tests passed');
  }
};
