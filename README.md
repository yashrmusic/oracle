# 🔮 Oracle v22.0 - AI-Powered Hiring Automation

**The Ultimate Enterprise Recruitment System for UrbanMistrii**

> **v22.0 Upgrade** - Now with Multi-Department Support, AI Portfolio Scoring, Google Calendar Integration, and Candidate Self-Service Portal!

---

## 📁 Project Structure

```
oracle-v21/
├── Config.gs         # Configuration, API keys, departments, business rules
├── Utils.gs          # Logging, validation, date helpers, duplicate detection
├── AI.gs             # Gemini + OpenRouter AI (scoring, analysis, replies)
├── WhatsApp.gs       # AiSensy WhatsApp API integration
├── Core.gs           # Main automation engine & status handlers
├── Email.gs          # Gmail processing, spam detection, timeline
├── Calendar.gs       # ✨ Google Calendar integration
├── Analytics.gs      # ✨ Metrics, reports, bottleneck detection
├── RetryQueue.gs     # ✨ Automatic retry for failed messages
├── Portal.gs         # ✨ Candidate self-service web app
├── Setup.gs          # Installation, testing, administration
└── README.md         # This file
```

---

## 🆕 What's New in v22.0

| Feature | Description |
|---------|-------------|
| **Multi-Department** | Design, Development, Marketing with separate test links & evaluators |
| **AI Portfolio Scoring** | Automatic portfolio evaluation with scores 0-10 |
| **Google Calendar** | Auto-create interview events with invites |
| **Candidate Portal** | Self-service: status check, test upload, interview booking |
| **Duplicate Detection** | Fuzzy matching to prevent repeat applications |
| **Retry Queue** | Auto-retry failed WhatsApp/email with exponential backoff |
| **Advanced Analytics** | Conversion funnels, bottlenecks, weekly reports |
| **Spam Detection** | AI filter for fake/spam applications |

---

## 🚀 Quick Start

### Step 1: Create Apps Script Project
1. Open your Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Delete the default code

### Step 2: Add Files
Create each `.gs` file and copy the corresponding code:

| Order | File | Purpose |
|-------|------|---------|
| 1 | `Config.gs` | Start here - contains all settings |
| 2 | `Utils.gs` | Helper functions |
| 3 | `AI.gs` | AI integration |
| 4 | `WhatsApp.gs` | Messaging |
| 5 | `Core.gs` | Main engine |
| 6 | `Email.gs` | Email processing |
| 7 | `Calendar.gs` | Calendar integration |
| 8 | `Analytics.gs` | Metrics & reports |
| 9 | `RetryQueue.gs` | Message retry |
| 10 | `Portal.gs` | Candidate portal |
| 11 | `Setup.gs` | Installation & testing |

### Step 3: Configure API Keys
1. Edit `Config.gs` → `SecureConfig.setup()` function
2. Replace placeholder keys:
   - `GEMINI_API_KEY` - [Google AI Studio](https://aistudio.google.com/)
   - `OPENROUTER_API_KEY` - [OpenRouter](https://openrouter.ai/)
   - `AISENSY_JWT` - [AiSensy Dashboard](https://app.aisensy.com/)
3. Run `setupSecureConfig()` **once**
4. **DELETE the keys from the code** after running

### Step 4: Activate
```javascript
1. setupSecureConfig()        // Store API keys
2. testSystemHealth()         // Verify configuration
3. INITIAL_PRODUCTION_SETUP() // Create triggers
4. testCompleteWorkflow()     // Run all 11 tests
```

### Step 5: Deploy Portal (Optional)
1. Go to **Deploy** → **New deployment**
2. Select **Web app**
3. Set access to "Anyone"
4. Copy the URL - this is your candidate portal!

---

## ✨ Features Deep Dive

### 🎨 Multi-Department Support

Configure in `Config.gs`:
```javascript
DEPARTMENTS: {
  DESIGN: {
    roles: ['Design Intern', 'Junior Designer', 'Senior Designer'],
    testLinks: { intern: '...', junior: '...', senior: '...' },
    evaluators: ['design-lead@company.com'],
    timeLimits: { intern: 2, junior: 24, senior: 48 }
  },
  DEVELOPMENT: { ... },
  MARKETING: { ... }
}
```

### 📊 AI Portfolio Scoring

Automatic when test is submitted:
```javascript
// Returns:
{
  score: 7.5,            // 0-10 rating
  strengths: ["..."],    // What's good
  weaknesses: ["..."],   // Areas to improve
  recommendation: "PROCEED", // PROCEED/REVIEW/REJECT
  summary: "...",        // One paragraph evaluation
  suggestedQuestions: [] // Interview questions based on portfolio
}
```

### 📅 Google Calendar Integration

```javascript
// Auto-creates interview events with:
Calendar.createInterview(candidate, dateTime);

// Features:
- Color-coded by role (Senior=Red, Junior=Yellow, Intern=Green)
- Auto-sends calendar invites to candidate
- 30min popup + 1hr email reminders
- Event description includes all candidate info

// Get available slots:
Calendar.getAvailableSlots(date); // Returns free times 10am-7pm
```

### 🌐 Candidate Self-Service Portal

A web app where candidates can:
- ✅ Check their application status
- 📤 Upload test submissions
- 📅 Book interview slots (self-schedule)

```javascript
// Send portal link to candidate:
sendPortalLink('candidate@email.com');

// Portal URL format:
https://script.google.com/.../exec?token=unique-token
```

### 🔍 Duplicate Detection

Uses Levenshtein distance for fuzzy matching:
```javascript
Duplicates.check(email, phone, name);

// Returns:
{
  isDuplicate: true,
  matchType: 'EMAIL_EXACT' | 'PHONE_EXACT' | 'NAME_FUZZY',
  similarity: 0.95,
  existingRow: 12,
  existingData: [...]
}
```

### 🔄 Retry Queue

Failed messages are automatically retried:
```javascript
// Exponential backoff: 1h → 2h → 4h → give up
// Stored in DB_RetryQueue sheet

RetryQueue.process();  // Called every 15 min
RetryQueue.getStats(); // { pending, completed, failed }
```

### 📈 Advanced Analytics

```javascript
Analytics.getMetrics();
// Returns: pipeline counts, conversion funnel, time metrics

Analytics.getBottlenecks();
// Returns: where candidates are stuck

Analytics.generateWeeklyReport();
// Full text report with all metrics
```

---

## 📊 Status Flow

```
NEW → IN PROCESS → TEST SENT → TEST SUBMITTED → UNDER REVIEW
                                                     ↓
                                         INTERVIEW PENDING
                                                     ↓
                                          INTERVIEW DONE
                                                     ↓
                               ┌──────────────────────────┐
                               ↓                          ↓
                            HIRED                 PENDING REJECTION
                                                          ↓
                                                      REJECTED
```

---

## 🔧 Database Columns

### DB_Candidates Sheet (v22.0)

| Col | Name | Description |
|-----|------|-------------|
| A | STATUS | Current status |
| B | UPDATED | Last update timestamp |
| C | TIMESTAMP | Application date |
| D | NAME | Candidate name |
| E | EMAIL | Email address |
| F | PHONE | Phone number |
| G | LOG | Latest action log |
| H | ROLE | Role applied for |
| I | TEST_SENT | Test sent timestamp |
| J | TEST_SUBMITTED | Submission timestamp |
| K | PORTFOLIO_URL | Portfolio links |
| L | AI_SCORE | AI evaluation score |
| M | INTERVIEW_DATE | Scheduled interview |
| N | DEPARTMENT | ✨ Design/Dev/Marketing |
| O | PORTFOLIO_SCORE | ✨ AI portfolio score 0-10 |
| P | PORTFOLIO_FEEDBACK | ✨ AI evaluation summary |
| Q | CALENDAR_EVENT_ID | ✨ Google Calendar event ID |
| R | PORTAL_TOKEN | ✨ Unique portal access token |

### New Sheet Tabs (v22.0)

- **DB_RetryQueue** - Failed message retry queue

---

## 🧪 Testing

```javascript
// Run all 11 tests
testCompleteWorkflow()

// Individual tests
testAI()             // AI integration
testWhatsApp()       // WhatsApp messaging
testCalendar()       // Calendar integration
testAnalytics()      // Analytics engine
testRetryQueue()     // Retry queue
testPortal()         // Portal functionality

// System health
testSystemHealth()   // Quick health check
getSystemStatus()    // View current state
```

---

## 🎛️ Feature Flags

Toggle features in `Config.gs`:
```javascript
FEATURES: {
  TEST_MODE: false,              // true = no actual sends
  AI_ENABLED: true,
  WHATSAPP_ENABLED: true,
  AUTO_FOLLOWUP: true,
  AUTO_REJECTION: true,
  ANALYTICS: true,
  CALENDAR_INTEGRATION: true,    // v22.0
  PORTAL_ENABLED: true,          // v22.0
  AUTO_PORTFOLIO_SCORING: true,  // v22.0
  DUPLICATE_CHECK: true          // v22.0
}
```

---

## ⏰ Automated Triggers

| Trigger | Function | Schedule |
|---------|----------|----------|
| On Edit | `universalAutomationEngine` | Every status change |
| Timer | `runOracleBackgroundCycle` | Every 15 min |
| Timer | `sendDailySummary` | Daily 9 AM IST |
| Timer | `sendWeeklyAnalyticsReport` | Monday 10 AM IST |

---

## 🚨 Emergency Controls

```javascript
EMERGENCY_STOP()   // Disable all triggers immediately
clearLogs()        // Clear log sheet

// To restart:
INITIAL_PRODUCTION_SETUP()
```

---

## 📞 WhatsApp Templates

Create in AiSensy dashboard:
- `hiring_welcome` - Welcome message
- `hiring_test_link` - Test link with deadline
- `hiring_schedule` - Interview schedule
- `hiring_reminder` - Follow-up reminder
- `hiring_rejection` - Rejection (optional)

---

## 🔐 Security

1. **API Keys**: Stored encrypted in Script Properties
2. **Portal Tokens**: Unique UUID per candidate
3. **Privacy Sync**: Masks sensitive columns for team view
4. **GDPR**: 180-day retention policy
5. **Test Mode**: Prevents accidental sends

---

## 🛠 Troubleshooting

### WhatsApp Not Sending
- Check AiSensy plan (free plan doesn't support API)
- Verify JWT token is correct
- Check DB_RetryQueue for failed attempts

### AI Not Responding
- Run `testAI()` to diagnose
- Fallback to OpenRouter should be automatic
- Check API quota in Google AI Studio

### Calendar Events Not Created
- Ensure `CALENDAR_INTEGRATION: true` in Config
- Check calendar permissions in Apps Script
- Verify interview date is set in sheet

### Portal Not Loading
- Ensure deployed as web app
- Check token is valid and not expired
- Verify candidate row has portal token

---

## 📈 Migration from v21.0

1. Add new columns N-R to your sheet
2. Copy new files (Calendar, Analytics, RetryQueue, Portal)
3. Update existing files with v22.0 code
4. Run `INITIAL_PRODUCTION_SETUP()` to recreate triggers
5. Test with `testCompleteWorkflow()`

---

**Version**: 22.0  
**Author**: UrbanMistrii  
**Updated**: December 2024
