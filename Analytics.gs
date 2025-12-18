/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.0 - ANALYTICS                         ║
 * ║                 Metrics, Reports & Insights                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const Analytics = {
  
  /**
   * Get comprehensive recruitment metrics
   */
  getMetrics() {
    try {
      const sheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.CANDIDATES);
      const data = sheet.getDataRange().getValues();
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = DateTime.addDays(today, -7);
      const monthAgo = DateTime.addDays(today, -30);
      
      const metrics = {
        // Pipeline counts
        pipeline: {
          new: 0,
          inProcess: 0,
          testSent: 0,
          testSubmitted: 0,
          underReview: 0,
          interviewPending: 0,
          interviewDone: 0,
          pendingRejection: 0,
          rejected: 0,
          hired: 0,
          total: data.length - 1
        },
        
        // Time-based metrics
        thisWeek: { applications: 0, hires: 0, rejections: 0 },
        thisMonth: { applications: 0, hires: 0, rejections: 0 },
        
        // Performance metrics
        performance: {
          avgTimeToHire: 0,
          avgTimeToReject: 0,
          avgTestCompletionRate: 0,
          avgTestTime: 0
        },
        
        // Conversion funnel
        funnel: {
          applicationToTest: 0,
          testToInterview: 0,
          interviewToHire: 0,
          overallConversion: 0
        },
        
        // By role breakdown
        byRole: {}
      };
      
      let totalTestTime = 0;
      let testCount = 0;
      let hireTime = 0;
      let hireCount = 0;
      
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const status = row[CONFIG.COLUMNS.STATUS - 1];
        const timestamp = new Date(row[CONFIG.COLUMNS.TIMESTAMP - 1]);
        const role = row[CONFIG.COLUMNS.ROLE - 1] || 'Unknown';
        const testSent = row[CONFIG.COLUMNS.TEST_SENT - 1];
        const testSubmitted = row[CONFIG.COLUMNS.TEST_SUBMITTED - 1];
        
        // Pipeline counts
        switch (status) {
          case CONFIG.RULES.STATUSES.NEW: metrics.pipeline.new++; break;
          case CONFIG.RULES.STATUSES.IN_PROCESS: metrics.pipeline.inProcess++; break;
          case CONFIG.RULES.STATUSES.TEST_SENT: metrics.pipeline.testSent++; break;
          case CONFIG.RULES.STATUSES.TEST_SUBMITTED: metrics.pipeline.testSubmitted++; break;
          case CONFIG.RULES.STATUSES.UNDER_REVIEW: metrics.pipeline.underReview++; break;
          case CONFIG.RULES.STATUSES.INTERVIEW_PENDING: metrics.pipeline.interviewPending++; break;
          case CONFIG.RULES.STATUSES.INTERVIEW_DONE: metrics.pipeline.interviewDone++; break;
          case CONFIG.RULES.STATUSES.PENDING_REJECTION: metrics.pipeline.pendingRejection++; break;
          case CONFIG.RULES.STATUSES.REJECTED: metrics.pipeline.rejected++; break;
          case CONFIG.RULES.STATUSES.HIRED: metrics.pipeline.hired++; break;
        }
        
        // Time-based
        if (timestamp >= weekAgo) {
          metrics.thisWeek.applications++;
          if (status === CONFIG.RULES.STATUSES.HIRED) metrics.thisWeek.hires++;
          if (status === CONFIG.RULES.STATUSES.REJECTED) metrics.thisWeek.rejections++;
        }
        if (timestamp >= monthAgo) {
          metrics.thisMonth.applications++;
          if (status === CONFIG.RULES.STATUSES.HIRED) metrics.thisMonth.hires++;
          if (status === CONFIG.RULES.STATUSES.REJECTED) metrics.thisMonth.rejections++;
        }
        
        // Test completion time
        if (testSent && testSubmitted) {
          const hours = DateTime.hoursBetween(new Date(testSent), new Date(testSubmitted));
          totalTestTime += hours;
          testCount++;
        }
        
        // Time to hire
        if (status === CONFIG.RULES.STATUSES.HIRED && timestamp) {
          const days = DateTime.daysBetween(timestamp, new Date(row[CONFIG.COLUMNS.UPDATED - 1]));
          hireTime += days;
          hireCount++;
        }
        
        // By role
        if (!metrics.byRole[role]) {
          metrics.byRole[role] = { total: 0, hired: 0, rejected: 0 };
        }
        metrics.byRole[role].total++;
        if (status === CONFIG.RULES.STATUSES.HIRED) metrics.byRole[role].hired++;
        if (status === CONFIG.RULES.STATUSES.REJECTED) metrics.byRole[role].rejected++;
      }
      
      // Calculate averages
      const total = metrics.pipeline.total;
      metrics.performance.avgTestTime = testCount > 0 ? (totalTestTime / testCount).toFixed(1) + 'h' : 'N/A';
      metrics.performance.avgTimeToHire = hireCount > 0 ? (hireTime / hireCount).toFixed(0) + ' days' : 'N/A';
      metrics.performance.avgTestCompletionRate = metrics.pipeline.testSent > 0 
        ? ((metrics.pipeline.testSubmitted / metrics.pipeline.testSent) * 100).toFixed(1) + '%' 
        : 'N/A';
      
      // Conversion funnel
      const gotTest = metrics.pipeline.testSent + metrics.pipeline.testSubmitted + metrics.pipeline.underReview + 
                      metrics.pipeline.interviewPending + metrics.pipeline.interviewDone + metrics.pipeline.hired;
      const gotInterview = metrics.pipeline.interviewPending + metrics.pipeline.interviewDone + metrics.pipeline.hired;
      
      metrics.funnel.applicationToTest = total > 0 ? ((gotTest / total) * 100).toFixed(1) + '%' : '0%';
      metrics.funnel.testToInterview = gotTest > 0 ? ((gotInterview / gotTest) * 100).toFixed(1) + '%' : '0%';
      metrics.funnel.interviewToHire = gotInterview > 0 ? ((metrics.pipeline.hired / gotInterview) * 100).toFixed(1) + '%' : '0%';
      metrics.funnel.overallConversion = total > 0 ? ((metrics.pipeline.hired / total) * 100).toFixed(2) + '%' : '0%';
      
      return metrics;
      
    } catch (e) {
      Log.error('ANALYTICS', 'Failed to get metrics', { error: e.message });
      return null;
    }
  },
  
  /**
   * Generate weekly report
   */
  generateWeeklyReport() {
    const metrics = this.getMetrics();
    if (!metrics) return null;
    
    const report = `
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    WEEKLY RECRUITMENT REPORT                                   ║
║                    ${new Date().toLocaleDateString('en-IN')}                                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝

📊 THIS WEEK'S HIGHLIGHTS
━━━━━━━━━━━━━━━━━━━━━━━━━
New Applications: ${metrics.thisWeek.applications}
Hires: ${metrics.thisWeek.hires}
Rejections: ${metrics.thisWeek.rejections}

📈 PIPELINE STATUS
━━━━━━━━━━━━━━━━━━
New:               ${metrics.pipeline.new}
In Process:        ${metrics.pipeline.inProcess}
Test Sent:         ${metrics.pipeline.testSent}
Test Submitted:    ${metrics.pipeline.testSubmitted}
Under Review:      ${metrics.pipeline.underReview}
Interview Pending: ${metrics.pipeline.interviewPending}
Interview Done:    ${metrics.pipeline.interviewDone}
━━━━━━━━━━━━━━━━━━
Hired:             ${metrics.pipeline.hired}
Rejected:          ${metrics.pipeline.rejected}

🎯 CONVERSION FUNNEL
━━━━━━━━━━━━━━━━━━━━
Application → Test: ${metrics.funnel.applicationToTest}
Test → Interview:   ${metrics.funnel.testToInterview}
Interview → Hire:   ${metrics.funnel.interviewToHire}
Overall:            ${metrics.funnel.overallConversion}

⏱️ PERFORMANCE
━━━━━━━━━━━━━━
Avg Time to Hire:      ${metrics.performance.avgTimeToHire}
Avg Test Time:         ${metrics.performance.avgTestTime}
Test Completion Rate:  ${metrics.performance.avgTestCompletionRate}

📋 BY ROLE
━━━━━━━━━━
${Object.entries(metrics.byRole).map(([role, data]) => 
  `${role}: ${data.total} total, ${data.hired} hired (${((data.hired/data.total)*100 || 0).toFixed(0)}%)`
).join('\n')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generated by Oracle v22.0 | ${new Date().toLocaleString('en-IN', {timeZone: 'Asia/Kolkata'})}
    `.trim();
    
    return report;
  },
  
  /**
   * Send weekly report via email
   */
  sendWeeklyReport() {
    const report = this.generateWeeklyReport();
    if (!report) return;
    
    Notify.team(
      `📊 Weekly Recruitment Report - ${new Date().toLocaleDateString('en-IN')}`,
      report
    );
    
    Log.success('ANALYTICS', 'Weekly report sent');
  },
  
  /**
   * Record custom metric to analytics sheet
   */
  recordMetric(name, value, metadata = {}) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID);
      let sheet = ss.getSheetByName(CONFIG.SHEETS.TABS.ANALYTICS);
      
      if (!sheet) {
        sheet = ss.insertSheet(CONFIG.SHEETS.TABS.ANALYTICS);
        sheet.appendRow(['Date', 'Metric', 'Value', 'Metadata']);
      }
      
      sheet.appendRow([
        new Date(),
        name,
        value,
        JSON.stringify(metadata)
      ]);
      
    } catch (e) {
      Log.error('ANALYTICS', 'Failed to record metric', { error: e.message });
    }
  },
  
  /**
   * Get bottleneck analysis - where are candidates getting stuck?
   */
  getBottlenecks() {
    const metrics = this.getMetrics();
    if (!metrics) return [];
    
    const bottlenecks = [];
    const p = metrics.pipeline;
    
    // Check for high numbers in each stage
    if (p.new > 10) {
      bottlenecks.push({
        stage: 'NEW',
        count: p.new,
        severity: 'HIGH',
        suggestion: 'Too many unprocessed applications. Consider processing or auto-rejecting.'
      });
    }
    
    if (p.testSent > 5 && p.testSubmitted < p.testSent * 0.5) {
      bottlenecks.push({
        stage: 'TEST_SENT',
        count: p.testSent,
        severity: 'MEDIUM',
        suggestion: 'Low test completion rate. Send more reminders or simplify the test.'
      });
    }
    
    if (p.underReview > 5) {
      bottlenecks.push({
        stage: 'UNDER_REVIEW',
        count: p.underReview,
        severity: 'HIGH',
        suggestion: 'Tests piling up for review. Schedule time to review submissions.'
      });
    }
    
    if (p.pendingRejection > 3) {
      bottlenecks.push({
        stage: 'PENDING_REJECTION',
        count: p.pendingRejection,
        severity: 'LOW',
        suggestion: 'Rejections queued - will be sent automatically within 24h.'
      });
    }
    
    return bottlenecks;
  }
};

/**
 * Test analytics
 */
function testAnalytics() {
  Logger.log('Testing Analytics...');
  
  const metrics = Analytics.getMetrics();
  Logger.log('Pipeline: ' + JSON.stringify(metrics.pipeline));
  Logger.log('Funnel: ' + JSON.stringify(metrics.funnel));
  
  const bottlenecks = Analytics.getBottlenecks();
  Logger.log('Bottlenecks: ' + JSON.stringify(bottlenecks));
  
  const report = Analytics.generateWeeklyReport();
  Logger.log(report);
  
  Logger.log('✅ Analytics test passed');
}

/**
 * Trigger for weekly report (to be scheduled)
 */
function sendWeeklyAnalyticsReport() {
  Analytics.sendWeeklyReport();
}
