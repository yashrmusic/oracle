/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                     URBANMISTRII ORACLE v22.2 - FORM HANDLERS                 ║
 * ║                     Processing Google Form Submissions                        ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const FormHandlers = {
    /**
     * Handle test submission from Google Form
     * Trigger: On Form Submit (Spreadsheet)
     */
    handleTestFormSubmit(e) {
        try {
            const responses = e.namedValues;
            // Handle potential variations in field names
            const email = (responses['Email Address'] || responses['Email'] || responses['Username'] || [''])[0].trim();

            if (!email) {
                Log.error('FORM', 'No email found in form submission');
                return;
            }

            const pdfDocsUrl = (responses['PDF/Docs Upload'] || responses['PDF/Docs'] || responses['Upload PDF/Docs'] || [''])[0];
            const dwgUrl = (responses['DWG Upload'] || responses['DWG Files'] || responses['Upload DWG'] || [''])[0];
            const otherFilesUrl = (responses['Other Files'] || responses['Other Uploads'] || [''])[0];
            const testNotes = (responses['Test Notes'] || responses['Notes'] || [''])[0];

            const submissionData = {
                pdfDocsUrl,
                dwgUrl,
                otherFilesUrl,
                testNotes
            };

            Log.info('FORM', 'Processing test submission', { email });

            // Find candidate by email
            const candidate = SheetUtils.findCandidateByEmail(email);

            const submissionTime = new Date();
            let hoursTaken = null;
            let timeStatus = 'Unknown';
            let candidateName = 'Unknown';
            let candidateRole = 'Unknown';
            let candidatePhone = 'Unknown';
            let testSentTime = null;

            if (candidate) {
                candidateName = candidate.name;
                candidateRole = candidate.role;
                candidatePhone = candidate.phone;
                testSentTime = candidate.testSent;

                if (testSentTime) {
                    hoursTaken = DateTime.hoursBetween(new Date(testSentTime), submissionTime);
                    const roleNormalized = (candidate.role || '').toLowerCase();
                    const timeLimit = CONFIG.RULES.TIME_LIMITS[roleNormalized.includes('senior') ? 'senior' : roleNormalized.includes('junior') ? 'junior' : 'intern'] || 2;
                    timeStatus = hoursTaken <= timeLimit ? `ON TIME (${hoursTaken.toFixed(1)}h / ${timeLimit}h)` : `LATE (${hoursTaken.toFixed(1)}h / ${timeLimit}h)`;
                }

                // Update candidate sheet
                const allUrls = [pdfDocsUrl, dwgUrl, otherFilesUrl].filter(Boolean).join(' | ');
                SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_URL, allUrls);
                SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.STATUS, CONFIG.RULES.STATUSES.TEST_SUBMITTED);
                SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.TEST_SUBMITTED, submissionTime);
                SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.LOG, `Form: ${timeStatus}`);

                // Trigger AI scoring
                if (pdfDocsUrl || dwgUrl) {
                    const scoreUrl = pdfDocsUrl || dwgUrl;
                    const score = AI.scorePortfolio(scoreUrl, candidate.role);
                    if (score && score.score) {
                        SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.AI_SCORE, score.score);
                        SheetUtils.updateCell(candidate.row, CONFIG.COLUMNS.PORTFOLIO_FEEDBACK, score.summary);
                    }
                }

                CandidateTimeline.add(email, 'TEST_SUBMITTED_VIA_FORM', {
                    pdfDocsUrl, dwgUrl, otherFilesUrl, timeStatus, hoursTaken
                });
            }

            // Log to DB_TestSubmissions sheet
            this._logToTestSubmissions({
                timestamp: submissionTime,
                name: candidateName,
                email: email,
                role: candidateRole,
                phone: candidatePhone,
                pdfDocsUrl,
                dwgUrl,
                otherFilesUrl,
                testNotes,
                timeStatus,
                hoursTaken,
                testSentAt: testSentTime
            });

            // Notify Admin
            this._notifyAdmin(candidateName, email, candidateRole, candidatePhone, submissionData, timeStatus);

            Log.success('FORM', 'Test submission processed', { email, timeStatus });

        } catch (err) {
            Log.error('FORM', 'Failed to handle form submission', { error: err.message, stack: err.stack });
        }
    },

    /**
     * Internal logger for Test Submissions
     */
    _logToTestSubmissions(logData) {
        try {
            let subSheet;
            try {
                subSheet = ConfigHelpers.getSheet(CONFIG.SHEETS.TABS.TEST_SUBMISSIONS);
            } catch (e) {
                const ss = SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID);
                subSheet = ss.insertSheet(CONFIG.SHEETS.TABS.TEST_SUBMISSIONS);
                subSheet.appendRow([
                    'Timestamp', 'Name', 'Email', 'Role', 'Phone',
                    'PDF/Docs URL', 'DWG URL', 'Other Files', 'Test Notes',
                    'Time Allotted (hrs)', 'Time Taken (hrs)', 'Status', 'Test Sent At'
                ]);
                subSheet.getRange(1, 1, 1, 13).setFontWeight('bold').setBackground('#4285f4').setFontColor('#ffffff');
            }

            const roleNormalized = (logData.role || '').toLowerCase();
            const timeLimit = CONFIG.RULES.TIME_LIMITS[roleNormalized.includes('senior') ? 'senior' : roleNormalized.includes('junior') ? 'junior' : 'intern'] || 2;

            subSheet.appendRow([
                logData.timestamp,
                logData.name,
                logData.email,
                logData.role,
                logData.phone,
                logData.pdfDocsUrl || '',
                logData.dwgUrl || '',
                logData.otherFilesUrl || '',
                logData.testNotes || '',
                timeLimit,
                logData.hoursTaken ? logData.hoursTaken.toFixed(2) : '',
                logData.timeStatus,
                logData.testSentAt || ''
            ]);
        } catch (e) {
            Log.error('FORM', 'Failed to write to DB_TestSubmissions', { error: e.message });
        }
    },

    /**
     * Internal admin notification
     */
    _notifyAdmin(name, email, role, phone, data, timeStatus) {
        const adminEmailHtml = EmailTemplates.wrap(`
      <h3>Test Submission Received (via Google Form)</h3>
      <p><strong>${name}</strong> has submitted their test.</p>
      
      <div style="background-color: #f9f9f9; padding: 20px; border-left: 4px solid ${timeStatus.includes('ON TIME') ? '#4caf50' : '#f44336'}; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Time Status:</strong> ${timeStatus}</p>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Name</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${name}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Email</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${email}</td></tr>
        <tr style="background: #f5f5f5;"><td style="padding: 10px; border: 1px solid #ddd;"><strong>Role</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${role}</td></tr>
        <tr><td style="padding: 10px; border: 1px solid #ddd;"><strong>Phone</strong></td><td style="padding: 10px; border: 1px solid #ddd;">${phone || 'N/A'}</td></tr>
      </table>
      
      <h4>Submitted Files:</h4>
      <ul>
        ${data.pdfDocsUrl ? `<li><strong>PDF/Docs:</strong> <a href="${data.pdfDocsUrl}">${data.pdfDocsUrl}</a></li>` : ''}
        ${data.dwgUrl ? `<li><strong>DWG Files:</strong> <a href="${data.dwgUrl}">${data.dwgUrl}</a></li>` : ''}
        ${data.otherFilesUrl ? `<li><strong>Other:</strong> <a href="${data.otherFilesUrl}">${data.otherFilesUrl}</a></li>` : ''}
      </ul>
      
      ${data.testNotes ? `<h4>Candidate Notes:</h4><p style="background: #fff3e0; padding: 15px; border-radius: 8px;">${data.testNotes}</p>` : ''}
      
      <p style="margin-top: 20px;">
        ${EmailTemplates.button('REVIEW IN SHEET', getSheetUrl())}
      </p>
    `);

        GmailApp.sendEmail(
            CONFIG.TEAM.ADMIN_EMAIL,
            `Form Submission: ${name} - ${timeStatus}`,
            `${name} submitted their test via form. Time: ${timeStatus}.`,
            { htmlBody: adminEmailHtml, name: 'Urbanmistrii Oracle' }
        );
    }
};
