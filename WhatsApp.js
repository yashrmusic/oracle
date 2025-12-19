/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                    URBANMISTRII ORACLE v22.1 - WHATSAPP                       ║
 * ║                    Twilio WhatsApp API Integration                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 * 
 * SETUP:
 * 1. Create a Twilio account at https://www.twilio.com
 * 2. Enable WhatsApp in the Twilio Console
 * 3. Get your Account SID and Auth Token
 * 4. Set up a WhatsApp sender (sandbox for testing, or approved number)
 * 5. Add credentials to SecureConfig.setup()
 */

const WhatsApp = {
  
  /**
   * Internal: Send WhatsApp message via Twilio
   */
  _send(destination, messageBody) {
    if (SecureConfig.isTestMode()) {
      Logger.log(`[WHATSAPP TEST] To: ${destination}, Message: ${messageBody.substring(0, 100)}...`);
      return { success: true, testMode: true };
    }

    try {
      const accountSid = SecureConfig.get('TWILIO_ACCOUNT_SID');
      const authToken = SecureConfig.get('TWILIO_AUTH_TOKEN');
      const fromNumber = SecureConfig.get('TWILIO_WHATSAPP_NUMBER'); // e.g., 'whatsapp:+14155238886'
      
      // Format phone number
      let phone = String(destination).replace(/\D/g, '');
      if (phone.length === 10) {
        phone = '91' + phone; // Add India country code
      }
      const toNumber = `whatsapp:+${phone}`;
      
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      
      // Twilio uses HTTP Basic Auth
      const authHeader = Utilities.base64Encode(`${accountSid}:${authToken}`);
      
      const payload = {
        'From': fromNumber,
        'To': toNumber,
        'Body': messageBody
      };
      
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: payload,
        muteHttpExceptions: true
      });
      
      const code = response.getResponseCode();
      const resText = response.getContentText();
      
      Log.info('WHATSAPP', `Sent message to ${Sanitize.maskEmail(phone)}`, {
        code: code,
        response: resText.substring(0, 200)
      });
      
      if (code >= 200 && code < 300) {
        const json = JSON.parse(resText);
        return { success: true, sid: json.sid, response: resText };
      } else {
        return { success: false, error: `HTTP ${code}: ${resText}` };
      }
    } catch (e) {
      Log.error('WHATSAPP', 'Send failed', { error: e.message });
      return { success: false, error: e.message };
    }
  },

  /**
   * Internal: Send WhatsApp template message via Twilio Content API
   * Use this for approved templates (required for business-initiated messages)
   */
  _sendTemplate(destination, contentSid, contentVariables = {}) {
    if (SecureConfig.isTestMode()) {
      Logger.log(`[WHATSAPP TEST] To: ${destination}, Template: ${contentSid}`);
      return { success: true, testMode: true };
    }

    try {
      const accountSid = SecureConfig.get('TWILIO_ACCOUNT_SID');
      const authToken = SecureConfig.get('TWILIO_AUTH_TOKEN');
      const fromNumber = SecureConfig.get('TWILIO_WHATSAPP_NUMBER');
      
      let phone = String(destination).replace(/\D/g, '');
      if (phone.length === 10) {
        phone = '91' + phone;
      }
      const toNumber = `whatsapp:+${phone}`;
      
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const authHeader = Utilities.base64Encode(`${accountSid}:${authToken}`);
      
      const payload = {
        'From': fromNumber,
        'To': toNumber,
        'ContentSid': contentSid,
        'ContentVariables': JSON.stringify(contentVariables)
      };
      
      const response = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        payload: payload,
        muteHttpExceptions: true
      });
      
      const code = response.getResponseCode();
      const resText = response.getContentText();
      
      if (code >= 200 && code < 300) {
        return { success: true, response: resText };
      } else {
        return { success: false, error: `HTTP ${code}: ${resText}` };
      }
    } catch (e) {
      Log.error('WHATSAPP', 'Template send failed', { error: e.message });
      return { success: false, error: e.message };
    }
  },

  /**
   * Send welcome message to new candidate
   */
  sendWelcome(phone, name) {
    const message = `Hi ${name}! 👋

Welcome to UrbanMistrii! We're excited to have you as a candidate.

Your application has been received and is being reviewed. We'll get back to you within 1-2 business days with the next steps.

Best regards,
Team UrbanMistrii 🎨`;
    
    return this._send(phone, message);
  },

  /**
   * Send test link to candidate
   */
  sendTestLink(phone, name, role, department) {
    const link = ConfigHelpers.getTestLink(role, department);
    const timeLimit = ConfigHelpers.getTimeLimit(role, department);
    
    const message = `Hi ${name}! 🎉

Great news! You've been selected to take our ${role} assessment.

📋 *Test Details:*
• Role: ${role}
• Time Limit: ${timeLimit} hours
• Link: ${link}

⏰ Please complete the test within ${timeLimit} hours of receiving this message.

📤 Once done, reply to this message or email us at hr@urbanmistrii.com with your submission.

Good luck! 🍀
Team UrbanMistrii`;
    
    return this._send(phone, message);
  },

  /**
   * Send interview schedule
   */
  sendInterviewSchedule(phone, name, role, dateString) {
    const message = `Hi ${name}! 🎊

Congratulations! You've cleared the assessment for ${role}.

📅 *Interview Details:*
• Date & Time: ${dateString}
• Mode: Video Call (link will be shared via email)
• Duration: ~30-45 minutes

Please confirm your availability by replying to this message.

See you soon! 🙌
Team UrbanMistrii`;
    
    return this._send(phone, message);
  },

  /**
   * Send reminder message
   */
  sendReminder(phone, name, messageStr) {
    const message = `Hi ${name}! 👋

Just a friendly reminder: ${messageStr}

If you have any questions, feel free to reach out!

Best,
Team UrbanMistrii`;
    
    return this._send(phone, message);
  },

  /**
   * Send rejection message
   */
  sendRejection(phone, name) {
    const message = `Hi ${name},

Thank you for your interest in UrbanMistrii and for taking the time to apply.

After careful consideration, we've decided to move forward with other candidates whose experience more closely matches our current needs.

We encourage you to apply again in the future as new opportunities arise.

Wishing you all the best in your career!

Warm regards,
Team UrbanMistrii`;
    
    return this._send(phone, message);
  }
};

/**
 * Test WhatsApp integration
 */
function testWhatsApp() {
  Logger.log('Testing Twilio WhatsApp integration...');
  
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
  Logger.log('║   TWILIO WHATSAPP DIAGNOSTICS         ║');
  Logger.log('╚═══════════════════════════════════════╝');
  
  // Check Account SID
  try {
    const sid = SecureConfig.get('TWILIO_ACCOUNT_SID');
    Logger.log('✅ Account SID: Configured (' + sid.substring(0, 10) + '...)');
  } catch (e) {
    Logger.log('❌ Account SID: Missing - Get from https://console.twilio.com');
  }
  
  // Check Auth Token
  try {
    const token = SecureConfig.get('TWILIO_AUTH_TOKEN');
    Logger.log('✅ Auth Token: Configured (' + token.substring(0, 10) + '...)');
  } catch (e) {
    Logger.log('❌ Auth Token: Missing');
  }
  
  // Check WhatsApp Number
  try {
    const num = SecureConfig.get('TWILIO_WHATSAPP_NUMBER');
    Logger.log('✅ WhatsApp Number: ' + num);
  } catch (e) {
    Logger.log('❌ WhatsApp Number: Missing');
    Logger.log('   For sandbox: whatsapp:+14155238886');
    Logger.log('   For production: whatsapp:+YOUR_TWILIO_NUMBER');
  }
  
  Logger.log('');
  Logger.log('📚 Twilio WhatsApp Quickstart:');
  Logger.log('   https://www.twilio.com/docs/whatsapp/quickstart');
  Logger.log('');
  Logger.log('💡 For sandbox testing, users must first send:');
  Logger.log('   "join <your-sandbox-keyword>" to +1 415 523 8886');
}
