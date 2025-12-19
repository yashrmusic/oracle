/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                    URBANMISTRII ORACLE v22.1 - CONFIG                         ║
 * ║                    The Brain's Control Center (Enhanced)                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * v22.0 NEW FEATURES:
 * - Multi-department support
 * - AI Portfolio Scoring
 * - Google Calendar Integration
 * - Candidate Self-Service Portal
 * - Duplicate Detection
 * - Retry Queue for Failed Messages
 * - Advanced Analytics
 * 
 * FIRST TIME SETUP:
 * 1. Run: setupSecureConfig() - ONE TIME ONLY
 * 2. It will ask for your API keys securely
 * 3. Never hardcode keys again!
 */

const CONFIG = {
  // ═══════════════════ SPREADSHEET IDs ═══════════════════
  SHEETS: {
    MASTER_ID: "112UbKamDcvQ-UkXshdhyDRFt0y7SX0NBgP00lvl98V4",
    PUBLIC_ID: "1_aSQEx8BJUWxpyR3RHLetuj7No-PE633jedgCAMBuzo",
    
    TABS: {
      CANDIDATES: "DB_Candidates",
      FOLLOWUP: "DB_FollowUp",
      LOGS: "DB_Logs",
      TIMELINE: "DB_Timeline",
      ANALYTICS: "DB_Analytics"
    }
  },

  // ═══════════════════ COLUMN MAPPINGS (1-Based) ═══════════════════
  COLUMNS: {
    STATUS: 1,
    UPDATED: 2,
    TIMESTAMP: 3,
    NAME: 4,
    EMAIL: 5,
    PHONE: 6,
    LOG: 7,
    ROLE: 8,
    TEST_SENT: 9,
    TEST_SUBMITTED: 10,
    PORTFOLIO_URL: 11,
    AI_SCORE: 12,
    INTERVIEW_DATE: 13,
    // v22.0 New Columns
    DEPARTMENT: 14,
    PORTFOLIO_SCORE: 15,
    PORTFOLIO_FEEDBACK: 16,
    CALENDAR_EVENT_ID: 17,
    PORTAL_TOKEN: 18
  },

  // ═══════════════════ BUSINESS RULES ═══════════════════
  RULES: {
    TIME_LIMITS: {
      intern: 2,      // hours
      junior: 24,     // hours
      senior: 48      // hours
    },
    
    REJECTION_DELAY_HRS: 24,
    MAX_FOLLOWUPS: 2,
    FOLLOWUP_DAYS: [2, 5], // Day 2 and Day 5 after test sent
    
    STATUSES: {
      NEW: "NEW",
      IN_PROCESS: "IN PROCESS",
      TEST_SENT: "TEST SENT",
      TEST_SUBMITTED: "TEST SUBMITTED",
      UNDER_REVIEW: "UNDER REVIEW",
      INTERVIEW_PENDING: "INTERVIEW PENDING",
      INTERVIEW_DONE: "INTERVIEW DONE",
      PENDING_REJECTION: "PENDING REJECTION",
      REJECTED: "REJECTED",
      HIRED: "HIRED"
    }
  },

  // ═══════════════════ WHATSAPP TEMPLATES ═══════════════════
  WHATSAPP: {
    TEMPLATES: {
      WELCOME: "hiring_welcome",
      TEST_LINK: "hiring_test_link",
      SCHEDULE: "hiring_schedule",
      REMINDER: "hiring_reminder",
      REJECTION: "hiring_rejection"
    }
  },

  // ═══════════════════ TEST LINKS BY ROLE ═══════════════════
  TEST_LINKS: {
    intern: "https://app.box.com/s/lvp6m9rcsgvkjixis6yt5422ajw2mr8t",
    junior: "https://app.box.com/folder/309187038121",
    senior: "https://app.box.com/s/mf3pbeethgznuha1oxzve2lhy79i209v"
  },

  // ═══════════════════ CONTACTS & EMAILS ═══════════════════
  TEAM: {
    ADMIN_EMAIL: "hr@urbanmistrii.com",
    TEAM_EMAILS: ["hr@urbanmistrii.com", "mail@urbanmistrii.com"],
    YASH_PHONE: "919312943581"
  },

  // ═══════════════════ PRIVACY & SECURITY ═══════════════════
  PRIVACY: {
    SENSITIVE_WORDS: ["salary", "stipend", "ctc", "expected", "pay", "current", "contact", "compensation"],
    GDPR_RETENTION_DAYS: 180 // Auto-delete rejected candidates after 6 months
  },

  // ═══════════════════ AI SETTINGS ═══════════════════
  AI: {
    MODELS: {
      PRIMARY: "gemini-2.0-flash",
      FALLBACK: "meta-llama/llama-3.3-70b-instruct:free"
    },
    MAX_TOKENS: 1000,
    TEMPERATURE: 0.7
  },

  // ═══════════════════ RATE LIMITS ═══════════════════
  RATE_LIMITS: {
    WHATSAPP_DELAY_MS: 2000,    // 2 sec between messages
    EMAIL_BATCH_SIZE: 10,        // Process 10 emails at a time
    API_RETRY_COUNT: 3,
    API_RETRY_DELAY_MS: 1000
  },

  // ═══════════════════ FEATURE FLAGS ═══════════════════
  FEATURES: {
    TEST_MODE: false,              // Set true to prevent actual sends
    AI_ENABLED: true,
    WHATSAPP_ENABLED: true,
    AUTO_FOLLOWUP: true,
    AUTO_REJECTION: true,
    ANALYTICS: true,
    CALENDAR_INTEGRATION: true,    // v22.0: Now enabled!
    PORTAL_ENABLED: true,          // v22.0: Candidate self-service
    AUTO_PORTFOLIO_SCORING: true,  // v22.0: AI scores portfolios automatically
    DUPLICATE_CHECK: true          // v22.0: Check for duplicate applications
  },

  // ═══════════════════ DEPARTMENTS (v22.0) ═══════════════════
  DEPARTMENTS: {
    DESIGN: {
      name: 'Design',
      roles: ['Design Intern', 'Junior Designer', 'Senior Designer', 'Lead Designer'],
      testLinks: {
        intern: 'https://app.box.com/s/lvp6m9rcsgvkjixis6yt5422ajw2mr8t',
        junior: 'https://app.box.com/folder/309187038121',
        senior: 'https://app.box.com/s/mf3pbeethgznuha1oxzve2lhy79i209v'
      },
      evaluators: ['hr@urbanmistrii.com'],
      timeLimits: { intern: 2, junior: 24, senior: 48 }
    },
    DEVELOPMENT: {
      name: 'Development',
      roles: ['Dev Intern', 'Junior Developer', 'Senior Developer'],
      testLinks: {
        intern: 'https://github.com/urbanmistrii/dev-test-intern',
        junior: 'https://github.com/urbanmistrii/dev-test-junior',
        senior: 'https://github.com/urbanmistrii/dev-test-senior'
      },
      evaluators: ['tech@urbanmistrii.com'],
      timeLimits: { intern: 4, junior: 48, senior: 72 }
    },
    MARKETING: {
      name: 'Marketing',
      roles: ['Marketing Intern', 'Marketing Executive', 'Marketing Manager'],
      testLinks: {
        intern: 'https://forms.google.com/marketing-intern-test',
        junior: 'https://forms.google.com/marketing-test',
        senior: 'https://forms.google.com/marketing-manager-test'
      },
      evaluators: ['marketing@urbanmistrii.com'],
      timeLimits: { intern: 24, junior: 48, senior: 72 }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                          SECURE API KEY MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

const SecureConfig = {
  /**
   * ONE-TIME SETUP: Store API keys securely
   * Run this function once, then delete it from your code
   */
  setup() {
    const props = PropertiesService.getScriptProperties();
    
    // Only run if not already configured
    if (props.getProperty('CONFIG_INITIALIZED')) {
      Logger.log('⚠️ Already configured. Delete keys manually in Project Settings if you need to reset.');
      return;
    }

    // Store keys (REPLACE THESE WITH YOUR ACTUAL KEYS)
    // ⚠️ DELETE THESE AFTER RUNNING setupSecureConfig() ONCE!
    props.setProperties({
      'GEMINI_API_KEY': 'AIzaSyAKYHZg6EJ3BkdVnkpQC5U38_1mGWqhSIg',
      'OPENROUTER_API_KEY': 'YOUR_OPENROUTER_API_KEY_HERE',  // Get from https://openrouter.ai/keys
      'AISENSY_JWT': 'YOUR_AISENSY_JWT_HERE',  // Or Twilio credentials when migrated
      'AISENSY_PROJECT_ID': 'YOUR_AISENSY_PROJECT_ID_HERE',
      'CONFIG_INITIALIZED': 'true'
    });

    Logger.log('✅ API Keys stored securely!');
    Logger.log('🔒 They are encrypted and only accessible by this script.');
    Logger.log('⚠️ IMPORTANT: Now delete the API keys from this code file!');
  },

  /**
   * Get API key safely
   */
  get(keyName) {
    const props = PropertiesService.getScriptProperties();
    const key = props.getProperty(keyName);
    
    if (!key) {
      throw new Error(`❌ Missing API key: ${keyName}. Run SecureConfig.setup() first!`);
    }
    
    return key;
  },

  /**
   * Validate all required keys exist
   */
  validate() {
    const required = [
      'GEMINI_API_KEY',
      'OPENROUTER_API_KEY',
      'AISENSY_JWT',
      'AISENSY_PROJECT_ID'
    ];

    const props = PropertiesService.getScriptProperties();
    const missing = required.filter(key => !props.getProperty(key));

    if (missing.length > 0) {
      throw new Error(`❌ Missing API keys: ${missing.join(', ')}. Run SecureConfig.setup() first!`);
    }

    return true;
  },

  /**
   * Test mode - prevents actual API calls
   */
  isTestMode() {
    return CONFIG.FEATURES.TEST_MODE;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

const ConfigHelpers = {
  /**
   * Get department for a specific role
   */
  getDepartment(role) {
    const r = (role || '').toLowerCase();
    if (r.includes('dev') || r.includes('engineer') || r.includes('programmer') || r.includes('tech') || r.includes('software')) return 'DEVELOPMENT';
    if (r.includes('marketing') || r.includes('content') || r.includes('social') || r.includes('sales') || r.includes('copy')) return 'MARKETING';
    return 'DESIGN';
  },

  /**
   * Get role-specific time limit in hours (department aware)
   */
  getTimeLimit(role, department) {
    const dept = department || this.getDepartment(role);
    const deptConfig = CONFIG.DEPARTMENTS[dept] || CONFIG.DEPARTMENTS.DESIGN;
    
    const roleKey = role.toLowerCase().includes('senior') ? 'senior' 
                  : role.toLowerCase().includes('junior') ? 'junior' 
                  : 'intern';
    
    return deptConfig.timeLimits[roleKey] || CONFIG.RULES.TIME_LIMITS[roleKey];
  },

  /**
   * Get test link for specific role (department aware)
   */
  getTestLink(role, department) {
    const dept = department || this.getDepartment(role);
    const deptConfig = CONFIG.DEPARTMENTS[dept] || CONFIG.DEPARTMENTS.DESIGN;
    
    const roleKey = role.toLowerCase().includes('senior') ? 'senior'
                  : role.toLowerCase().includes('junior') ? 'junior'
                  : 'intern';
                  
    return deptConfig.testLinks[roleKey] || CONFIG.TEST_LINKS[roleKey];
  },

  /**
   * Check if a word is sensitive (for privacy sync)
   */
  isSensitive(word) {
    return CONFIG.PRIVACY.SENSITIVE_WORDS.some(
      sensitive => word.toLowerCase().includes(sensitive)
    );
  },

  /**
   * Get sheet by name with error handling
   */
  getSheet(tabName) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID);
      const sheet = ss.getSheetByName(tabName);
      
      if (!sheet) {
        throw new Error(`Sheet "${tabName}" not found`);
      }
      
      return sheet;
    } catch (e) {
      Logger.log(`❌ Error accessing sheet "${tabName}": ${e.message}`);
      throw e;
    }
  },

  /**
   * Validate phone number format
   */
  validatePhone(phone) {
    const cleaned = String(phone).replace(/\D/g, '');
    return cleaned.length === 10 || cleaned.length === 12;
  },

  /**
   * Validate email format
   */
  validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
  }
};

/**
 * RUN THIS ONCE to initialize secure configuration
 */
function setupSecureConfig() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('   ORACLE v22.0 - SECURE SETUP');
  Logger.log('═══════════════════════════════════════');
  
  try {
    SecureConfig.setup();
    SecureConfig.validate();
    
    Logger.log('');
    Logger.log('✅ Configuration complete!');
    Logger.log('✅ All API keys are now stored securely.');
    Logger.log('');
    Logger.log('⚠️ NEXT STEPS:');
    Logger.log('1. Delete the API keys from SecureConfig.setup() function');
    Logger.log('2. Save this script');
    Logger.log('3. Run: testSystemHealth()');
    Logger.log('');
    
  } catch (e) {
    Logger.log('❌ Setup failed: ' + e.message);
  }
}

/**
 * Test that everything is configured correctly
 */
function testSystemHealth() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('   SYSTEM HEALTH CHECK');
  Logger.log('═══════════════════════════════════════');
  
  let passed = 0;
  let failed = 0;

  // Test 1: API Keys
  try {
    SecureConfig.validate();
    Logger.log('✅ API Keys: Configured');
    passed++;
  } catch (e) {
    Logger.log('❌ API Keys: Missing');
    failed++;
  }

  // Test 2: Master Sheet
  try {
    SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID);
    Logger.log('✅ Master Sheet: Accessible');
    passed++;
  } catch (e) {
    Logger.log('❌ Master Sheet: Not accessible');
    failed++;
  }

  // Test 3: Public Sheet
  try {
    SpreadsheetApp.openById(CONFIG.SHEETS.PUBLIC_ID);
    Logger.log('✅ Public Sheet: Accessible');
    passed++;
  } catch (e) {
    Logger.log('❌ Public Sheet: Not accessible');
    failed++;
  }

  Logger.log('');
  Logger.log(`Results: ${passed} passed, ${failed} failed`);
  Logger.log('═══════════════════════════════════════');
  
  return failed === 0;
}
