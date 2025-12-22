/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                     URBANMISTRII ORACLE v22.3 - AUTOMATION SETUP              ║
 * ║                     Programmatic Setup of Forms & Triggers                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

/**
 * RUN THIS FUNCTION to set up the form and triggers!
 */
function runAutomationSetup() {
    AutomationSetup.setupTestSubmissionFlow();
}

const AutomationSetup = {
    /**
     * One-click setup for the Test Submission workflow.
     * Creates the form, links it to sheets, and sets up trigger.
     */
    setupTestSubmissionFlow() {
        Logger.log('🚀 Starting Test Submission Automation Setup...');

        try {
            // 1. Create the Form
            const form = FormApp.create('UrbanMistrii Oracle - Test Submission v2');
            form.setDescription('Please submit your test files and notes here. Ensure you use the same email address you applied with.');

            // 2. Add Fields
            form.addTextItem().setTitle('Email Address').setRequired(true);

            // File upload items require a manual click to enable files initially, 
            // but we can pre-create them. 
            // NOTE: Google Forms API restricts file uploads to Workspace members only if not handled carefully.
            form.addSectionHeaderItem().setTitle('File Uploads');
            form.addParagraphTextItem().setTitle('PDF/Docs Upload').setHelpText('Paste the Google Drive link or Box link to your PDF/Docs/Presentation.');
            form.addParagraphTextItem().setTitle('DWG Upload').setHelpText('Paste the link to your AutoCAD/DWG files.');
            form.addParagraphTextItem().setTitle('Other Files').setHelpText('Paste the link to any other supporting files (Renders, references, etc.)');
            form.addParagraphTextItem().setTitle('Test Notes').setHelpText('Any notes about your design approach or technical challenges.');

            // 3. Link to Spreadsheet
            const ssId = CONFIG.SHEETS.MASTER_ID;
            form.setDestination(FormApp.DestinationType.SPREADSHEET, ssId);

            // 4. Set up Trigger
            this._createFormSubmitTrigger();

            const formUrl = form.getPublishedUrl();
            const editorUrl = form.getEditUrl();

            Logger.log('\n✅ SETUP SUCCESSFUL!');
            Logger.log('════════════════════════════════════════════════════════════════════');
            Logger.log('📝 FORM URL (Send to candidates):');
            Logger.log(formUrl);
            Logger.log('\n🛠️ FORM EDITOR (Check settings):');
            Logger.log(editorUrl);
            Logger.log('════════════════════════════════════════════════════════════════════');

            return {
                success: true,
                formUrl: formUrl,
                editorUrl: editorUrl
            };

        } catch (err) {
            Logger.log('❌ SETUP FAILED: ' + err.message);
            return { success: false, error: err.message };
        }
    },

    /**
     * Programmatically create the On Form Submit trigger
     */
    _createFormSubmitTrigger() {
        const functionName = 'FormHandlers.handleTestFormSubmit';

        // Remove existing triggers to avoid duplicates
        const triggers = ScriptApp.getProjectTriggers();
        triggers.forEach(t => {
            if (t.getHandlerFunction() === functionName) {
                ScriptApp.deleteTrigger(t);
            }
        });

        // Create new trigger
        ScriptApp.newTrigger(functionName)
            .forSpreadsheet(SpreadsheetApp.openById(CONFIG.SHEETS.MASTER_ID))
            .onFormSubmit()
            .create();

        Logger.log('✅ Trigger created for: ' + functionName);
    }
};
