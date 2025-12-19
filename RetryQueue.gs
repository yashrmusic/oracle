/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.1 - RETRY QUEUE                       ║
 * ║                 Automatic Retry for Failed Messages                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const RetryQueue = {
  SHEET_NAME: 'DB_RetryQueue',
  MAX_RETRIES: 3,
  
  /**
   * Initialize retry queue sheet if it doesn't exist
   */
  init() {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID);
      let sheet = ss.getSheetByName(this.SHEET_NAME);
      
      if (!sheet) {
        sheet = ss.insertSheet(this.SHEET_NAME);
        sheet.appendRow([
          'ID', 'Created', 'Type', 'Payload', 'RetryAfter', 
          'Attempts', 'LastError', 'Status'
        ]);
        sheet.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#f4b400');
        Log.info('RETRY_QUEUE', 'Initialized retry queue sheet');
      }
      
      return sheet;
    } catch (e) {
      Log.error('RETRY_QUEUE', 'Init failed', { error: e.message });
      return null;
    }
  },
  
  /**
   * Add a failed message to the retry queue
   * @param {string} type - 'WHATSAPP' or 'EMAIL'
   * @param {object} payload - The message payload to retry
   * @param {string} error - The error message from the failed attempt
   */
  add(type, payload, error) {
    try {
      const sheet = this.init();
      if (!sheet) return false;
      
      const id = Utilities.getUuid();
      const retryAfter = DateTime.addHours(new Date(), 1); // First retry in 1 hour
      
      sheet.appendRow([
        id,
        new Date(),
        type,
        JSON.stringify(payload),
        retryAfter,
        0,
        error,
        'PENDING'
      ]);
      
      Log.info('RETRY_QUEUE', 'Added to queue', { type, id });
      return id;
      
    } catch (e) {
      Log.error('RETRY_QUEUE', 'Failed to add to queue', { error: e.message });
      return false;
    }
  },
  
  /**
   * Process pending retries (called by background cycle)
   */
  process() {
    try {
      const sheet = this.init();
      if (!sheet) return;
      
      const data = sheet.getDataRange().getValues();
      const now = new Date();
      let processed = 0;
      
      for (let i = 1; i < data.length; i++) {
        const status = data[i][7];
        const retryAfter = new Date(data[i][4]);
        const attempts = data[i][5];
        
        // Skip if not pending or not due yet
        if (status !== 'PENDING') continue;
        if (retryAfter > now) continue;
        
        const row = i + 1;
        const type = data[i][2];
        const payload = JSON.parse(data[i][3]);
        
        Log.info('RETRY_QUEUE', `Retrying ${type}`, { attempts: attempts + 1 });
        
        let result;
        
        // Retry based on type
        if (type === 'WHATSAPP') {
          result = WhatsApp._send(payload.destination, payload.template, payload.params);
        } else if (type === 'EMAIL') {
          try {
            GmailApp.sendEmail(payload.to, payload.subject, payload.body, payload.options || {});
            result = { success: true };
          } catch (e) {
            result = { success: false, error: e.message };
          }
        }
        
        if (result && result.success) {
          // Success! Mark as completed
          sheet.getRange(row, 8).setValue('COMPLETED');
          sheet.getRange(row, 6).setValue(attempts + 1);
          Log.success('RETRY_QUEUE', 'Retry successful', { type });
        } else {
          // Failed again
          const newAttempts = attempts + 1;
          
          if (newAttempts >= this.MAX_RETRIES) {
            // Give up
            sheet.getRange(row, 8).setValue('FAILED');
            sheet.getRange(row, 7).setValue(result?.error || 'Max retries exceeded');
            Log.warn('RETRY_QUEUE', 'Max retries reached, giving up', { type });
          } else {
            // Schedule next retry with exponential backoff
            const nextRetry = DateTime.addHours(now, Math.pow(2, newAttempts)); // 2h, 4h, 8h
            sheet.getRange(row, 5).setValue(nextRetry);
            sheet.getRange(row, 6).setValue(newAttempts);
            sheet.getRange(row, 7).setValue(result?.error || 'Unknown error');
          }
        }
        
        processed++;
      }
      
      if (processed > 0) {
        Log.info('RETRY_QUEUE', `Processed ${processed} retries`);
      }
      
    } catch (e) {
      Log.error('RETRY_QUEUE', 'Process failed', { error: e.message });
    }
  },
  
  /**
   * Get queue statistics
   */
  getStats() {
    try {
      const sheet = this.init();
      if (!sheet) return null;
      
      const data = sheet.getDataRange().getValues();
      const stats = { pending: 0, completed: 0, failed: 0, total: data.length - 1 };
      
      for (let i = 1; i < data.length; i++) {
        const status = data[i][7];
        if (status === 'PENDING') stats.pending++;
        else if (status === 'COMPLETED') stats.completed++;
        else if (status === 'FAILED') stats.failed++;
      }
      
      return stats;
    } catch (e) {
      return null;
    }
  },
  
  /**
   * Clean up old completed/failed entries (older than 7 days)
   */
  cleanup() {
    try {
      const sheet = this.init();
      if (!sheet) return;
      
      const data = sheet.getDataRange().getValues();
      const cutoff = DateTime.addDays(new Date(), -7);
      const rowsToDelete = [];
      
      for (let i = 1; i < data.length; i++) {
        const created = new Date(data[i][1]);
        const status = data[i][7];
        
        if ((status === 'COMPLETED' || status === 'FAILED') && created < cutoff) {
          rowsToDelete.push(i + 1);
        }
      }
      
      // Delete from bottom to top to maintain row indices
      for (let i = rowsToDelete.length - 1; i >= 0; i--) {
        sheet.deleteRow(rowsToDelete[i]);
      }
      
      if (rowsToDelete.length > 0) {
        Log.info('RETRY_QUEUE', `Cleaned up ${rowsToDelete.length} old entries`);
      }
      
    } catch (e) {
      Log.error('RETRY_QUEUE', 'Cleanup failed', { error: e.message });
    }
  }
};

/**
 * Test retry queue
 */
function testRetryQueue() {
  Logger.log('Testing Retry Queue...');
  
  // Initialize
  RetryQueue.init();
  
  // Add test item
  const id = RetryQueue.add('WHATSAPP', {
    destination: '9999999999',
    template: 'test_template',
    params: ['Test User']
  }, 'Test error');
  
  Logger.log('Added to queue: ' + id);
  
  // Get stats
  const stats = RetryQueue.getStats();
  Logger.log('Queue stats: ' + JSON.stringify(stats));
  
  Logger.log('✅ Retry Queue test passed');
}
