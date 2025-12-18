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
    const str = date.toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
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
  email(to, subject, body, options = {}) {
    if (SecureConfig.isTestMode() && !to.includes("test")) {
       Logger.log(`[TEST MODE] Would email ${to}: ${subject}`);
       return;
    }
    
    GmailApp.sendEmail(to, subject, body, options);
  },

  team(subject, body) {
    const emails = CONFIG.TEAM.TEAM_EMAILS.join(',');
    this.email(emails, subject, body);
  },

  dailySummary(stats) {
    const body = `
    DAILY RECRUITMENT SUMMARY
    Date: ${new Date().toLocaleDateString()}

    📊 OVERVIEW
    Total Candidates: ${stats.total}
    New Today: ${stats.new}
    Hired: ${stats.hired}
    Rejected: ${stats.rejected}

    📉 PIPELINE
    Tests Sent: ${stats.testsSent}
    Tests Submitted: ${stats.testsSubmitted}
    Interviews: ${stats.interviews}

    Performance:
    Conversion Rate: ${stats.conversionRate}%
    Avg Response: ${stats.avgResponseTime}
    `;

    this.team(`📊 Daily Hiring Analytics - ${new Date().toLocaleDateString()}`, body);
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
