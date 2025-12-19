/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                    URBANMISTRII ORACLE v22.0 - WHATSAPP                       ║
 * ║                    AiSensy API Integration                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const WhatsApp = {
  
  /**
   * Internal: Send WhatsApp message via AiSensy
   */
  _send(destination, templateName, params = []) {
    if (SecureConfig.isTestMode()) {
      Logger.log(`[WHATSAPP TEST] To: ${destination}, Template: ${templateName}, Params: ${JSON.stringify(params)}`);
      return { success: true, testMode: true };
    }

    const jwt = SecureConfig.get('AISENSY_JWT');
    const url = "https://backend.aisensy.com/campaign/t1/api/v2";

    // Format phone number (remove non-digits, ensure country code)
    let phone = String(destination).replace(/\D/g, '');
    if (phone.length === 10) {
      phone = '91' + phone; // Add India country code
    }

    const payload = {
      apiKey: jwt,
      campaignName: templateName + "_" + Date.now(),
      destination: phone,
      userName: params[0] || "Candidate",
      templateParams: params,
      source: "Oracle_v21"
    };
    
    try {
      const response = UrlFetchApp.fetch(url, {
        method: "post",
        headers: {
          "Content-Type": "application/json"
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      
      const resText = response.getContentText();
      const code = response.getResponseCode();
      
      Log.info('WHATSAPP', `Sent ${templateName} to ${Sanitize.maskEmail(phone)}`, {
        code: code,
        response: resText.substring(0, 200)
      });
      
      if (code >= 200 && code < 300) {
        return { success: true, response: resText };
      } else {
        return { success: false, error: `HTTP ${code}: ${resText}` };
      }
    } catch (e) {
      Log.error('WHATSAPP', 'Send failed', { error: e.message });
      return { success: false, error: e.message };
    }
  },

  /**
   * Send welcome message to new candidate
   */
  sendWelcome(phone, name) {
    const template = CONFIG.WHATSAPP.TEMPLATES.WELCOME;
    return this._send(phone, template, [name]);
  },

  /**
   * Send test link to candidate
   */
  sendTestLink(phone, name, role, department) {
    const template = CONFIG.WHATSAPP.TEMPLATES.TEST_LINK;
    const link = ConfigHelpers.getTestLink(role, department);
    const timeLimit = ConfigHelpers.getTimeLimit(role, department);
    // Params: Name, Role, TimeLimit, Link
    return this._send(phone, template, [name, role, String(timeLimit), link]);
  },

  /**
   * Send interview schedule
   */
  sendInterviewSchedule(phone, name, role, dateString) {
    const template = CONFIG.WHATSAPP.TEMPLATES.SCHEDULE;
    // Params: Name, Role, Date
    return this._send(phone, template, [name, role, dateString]);
  },

  /**
   * Send reminder message
   */
  sendReminder(phone, name, messageStr) {
    const template = CONFIG.WHATSAPP.TEMPLATES.REMINDER;
    // Params: Name, Message
    return this._send(phone, template, [name, messageStr]);
  },

  /**
   * Send rejection message (optional - usually via email)
   */
  sendRejection(phone, name) {
    const template = CONFIG.WHATSAPP.TEMPLATES.REJECTION;
    return this._send(phone, template, [name]);
  }
};

/**
 * Test WhatsApp integration
 */
function testWhatsApp() {
  Logger.log('Testing WhatsApp integration...');
  
  // Send test to Yash
  const result = WhatsApp.sendWelcome(CONFIG.TEAM.YASH_PHONE, 'Test User');
  
  if (result.success) {
    Logger.log('✅ WhatsApp test passed');
    Logger.log('Response: ' + JSON.stringify(result));
  } else if (result.testMode) {
    Logger.log('✅ WhatsApp test passed (TEST MODE)');
  } else {
    Logger.log('❌ WhatsApp test failed: ' + result.error);
  }
  
  return result;
}

/**
 * Send test message to Yash
 */
function sendTestToYash() {
  const result = WhatsApp.sendWelcome(CONFIG.TEAM.YASH_PHONE, 'Yash');
  Logger.log('Result: ' + JSON.stringify(result));
  return result;
}

/**
 * Diagnostics for WhatsApp setup
 */
function diagnosticsWhatsApp() {
  Logger.log('╔═══════════════════════════════════════╗');
  Logger.log('║   WHATSAPP DIAGNOSTICS                ║');
  Logger.log('╚═══════════════════════════════════════╝');
  
  // Check JWT
  try {
    const jwt = SecureConfig.get('AISENSY_JWT');
    Logger.log('✅ JWT: Configured (' + jwt.substring(0, 20) + '...)');
  } catch (e) {
    Logger.log('❌ JWT: Missing');
  }
  
  // Check Project ID
  try {
    const pid = SecureConfig.get('AISENSY_PROJECT_ID');
    Logger.log('✅ Project ID: ' + pid);
  } catch (e) {
    Logger.log('❌ Project ID: Missing');
  }
  
  // Check templates
  Logger.log('');
  Logger.log('📝 Configured Templates:');
  Object.entries(CONFIG.WHATSAPP.TEMPLATES).forEach(([key, value]) => {
    Logger.log(`   ${key}: ${value}`);
  });
  
  Logger.log('');
  Logger.log('💡 Make sure these templates exist in your AiSensy dashboard!');
}
