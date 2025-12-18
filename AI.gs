/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                      URBANMISTRII ORACLE v21.0 - AI                           ║
 * ║                      Gemini Pro + Llama 3 Configuration                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const AI = {
  /**
   * Main LLM Call Router
   */
  call(prompt, systemInstruction = "You are a helpful HR assistant.") {
    if (SecureConfig.isTestMode()) {
       Logger.log('[AI TEST] Prompt: ' + prompt.substring(0, 50) + '...');
       return "AI_TEST_RESPONSE";
    }

    try {
      return this._callGemini(prompt, systemInstruction);
    } catch (e) {
      Log.warn("AI", "Gemini failed, falling back to OpenRouter", {error: e.message});
      return this._callOpenRouter(prompt, systemInstruction);
    }
  },

  _callGemini(prompt, system) {
    const key = SecureConfig.get('GEMINI_API_KEY');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.AI.MODELS.PRIMARY}:generateContent?key=${key}`;
    
    const payload = {
      contents: [{
        parts: [{text: system + "\n\n" + prompt}]
      }],
      generationConfig: {
        temperature: CONFIG.AI.TEMPERATURE,
        maxOutputTokens: CONFIG.AI.MAX_TOKENS
      }
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    if (json.error) throw new Error(json.error.message);
    
    return json.candidates[0].content.parts[0].text;
  },

  _callOpenRouter(prompt, system) {
    const key = SecureConfig.get('OPENROUTER_API_KEY');
    const url = "https://openrouter.ai/api/v1/chat/completions";
    
    const payload = {
      model: CONFIG.AI.MODELS.FALLBACK,
      messages: [
        {role: "system", content: system},
        {role: "user", content: prompt}
      ]
    };

    const response = UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    
    const json = JSON.parse(response.getContentText());
    return json.choices[0].message.content;
  },

  /**
   * Specific AI Tasks
   */

  analyzeIntent(body, subject, hasAttachments) {
    const prompt = `
    Analyze this email and categorize its intent.
    Subject: ${subject}
    Body: ${body}
    Has Attachments: ${hasAttachments}

    Categories:
    - TEST_SUBMISSION (Uses words like 'submitted', 'test', 'task', attached files)
    - NEW_APPLICATION (Applying for a job, sharing portfolio/resume)
    - FOLLOWUP (Asking about status, or previous conversation)
    - QUESTION (Asking specific question about process/company)
    - ESCALATE (Angry, urgent, complaint)
    - SPAM (Marketing, irrelevant)

    Return ONLY JSON:
    {
      "intent": "CATEGORY",
      "confidence": 0.0-1.0,
      "name": "Extracted Name if available",
      "role": "Extracted Role if available (Intern/Junior/Senior)"
    }
    `;

    try {
      const result = this.call(prompt, "You are an JSON extraction bot.");
      // Clean markdown code blocks if present
      const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      Log.error("AI", "Intent analysis failed", {error: e.message});
      return null;
    }
  },

  extractCandidateInfo(body, subject) {
    const prompt = `
    Extract candidate details from this email.
    Subject: ${subject}
    Body: ${body}
    
    Return JSON:
    {
      "name": "Full Name",
      "email": "Email Address",
      "phone": "Phone Number (if present)",
      "role": "Inferred Role (Intern/Junior/Senior)",
      "portfolioLinks": ["link1", "link2"]
    }
    `;
    
    try {
       const res = this.call(prompt, "Extract strict JSON.");
       return JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
       return null;
    }
  },

  generateRejection(name, role, reason) {
    const prompt = `
    Write a gentle, professional rejection email for ${name} applied for ${role}.
    Context/Reason: ${reason}.
    
    Tone: Empathetic, encouraging, professional. High warmth.
    No placeholders. Sign off as 'Team UrbanMistrii'.
    `;
    return this.call(prompt);
  },

  suggestReply(questionText, context) {
    const prompt = `
    Draft a helpful reply to this candidate question.
    Candidate: ${context.name}, Role: ${context.role}, Status: ${context.status}.
    Question: "${questionText}"
    
    Rules: 
    - Be concise and friendly.
    - If status is NEW, say 1-2 days for review.
    - If TEST_SENT, encourage submission.
    - If TEST_SUBMITTED, say 2-3 days for review.
    `;
    return this.call(prompt);
  },

  /**
   * Score a portfolio using AI analysis
   * @param {string} portfolioUrl - URL to the portfolio
   * @param {string} role - Candidate role (Intern/Junior/Senior)
   * @returns {object} { score, strengths, weaknesses, recommendation, summary }
   */
  scorePortfolio(portfolioUrl, role = 'Designer') {
    if (!portfolioUrl) {
      return { score: 0, error: 'No portfolio URL provided' };
    }
    
    // Try to fetch portfolio content
    let portfolioContent = '';
    try {
      const response = UrlFetchApp.fetch(portfolioUrl, { muteHttpExceptions: true });
      if (response.getResponseCode() === 200) {
        // Extract text content (simplified - works for most portfolio sites)
        portfolioContent = response.getContentText()
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .substring(0, 3000); // Limit content size
      }
    } catch (e) {
      Log.warn('AI', 'Could not fetch portfolio', { url: portfolioUrl, error: e.message });
    }
    
    const prompt = `
    Evaluate this design portfolio for a ${role} position at UrbanMistrii (an interior design company).
    
    Portfolio URL: ${portfolioUrl}
    ${portfolioContent ? `Portfolio Content Preview: ${portfolioContent}` : 'Could not fetch content - evaluate based on URL structure and common portfolio patterns.'}
    
    Evaluation Criteria:
    1. Visual Design Quality (aesthetics, typography, color usage)
    2. Project Variety (range of work shown)
    3. Presentation (how work is displayed and explained)
    4. Technical Skills (tools, techniques demonstrated)
    5. Creativity & Originality
    6. Relevance to Interior Design
    
    Return ONLY valid JSON:
    {
      "score": 7.5,
      "strengths": ["Strong visual hierarchy", "Good project variety"],
      "weaknesses": ["Could improve case study depth"],
      "recommendation": "PROCEED" or "REVIEW" or "REJECT",
      "summary": "One paragraph summary of candidate's design abilities",
      "suggestedQuestions": ["Question 1 for interview", "Question 2"]
    }
    
    Score Guide:
    - 8-10: Exceptional, fast-track to interview
    - 6-7.9: Good, proceed with standard process
    - 4-5.9: Average, needs thorough review
    - 0-3.9: Below requirements
    `;
    
    try {
      const result = this.call(prompt, "You are an expert design portfolio evaluator. Return only valid JSON.");
      const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      Log.info('AI', 'Portfolio scored', { 
        url: portfolioUrl.substring(0, 50), 
        score: parsed.score,
        recommendation: parsed.recommendation 
      });
      
      return parsed;
    } catch (e) {
      Log.error('AI', 'Portfolio scoring failed', { error: e.message });
      return { 
        score: 5, 
        error: e.message,
        recommendation: 'REVIEW',
        summary: 'Automatic scoring failed - manual review required'
      };
    }
  },

  /**
   * Generate interview questions based on candidate profile
   */
  generateInterviewQuestions(candidate, portfolioScore = null) {
    const prompt = `
    Generate 5 interview questions for a ${candidate.role} candidate at UrbanMistrii (interior design company).
    
    Candidate: ${candidate.name}
    Role: ${candidate.role}
    ${portfolioScore ? `Portfolio Score: ${portfolioScore.score}/10` : ''}
    ${portfolioScore?.weaknesses ? `Areas to probe: ${portfolioScore.weaknesses.join(', ')}` : ''}
    
    Mix of:
    - Technical design questions
    - Behavioral/situational questions
    - Culture fit questions
    - Role-specific challenges
    
    Return JSON array:
    ["Question 1", "Question 2", "Question 3", "Question 4", "Question 5"]
    `;
    
    try {
      const result = this.call(prompt, "Generate interview questions as JSON array only.");
      return JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      return [
        "Walk me through your design process for a recent project.",
        "How do you handle feedback from clients?",
        "What design tools are you most comfortable with?",
        "Describe a challenging project and how you solved it.",
        "Why are you interested in interior design?"
      ];
    }
  },

  /**
   * Detect spam/fake applications
   */
  detectSpam(email, name, body) {
    const prompt = `
    Analyze if this job application appears legitimate or spam/fake.
    
    Email: ${email}
    Name: ${name}
    Content: ${body.substring(0, 500)}
    
    Red flags to check:
    - Generic/template content
    - Mismatched name/email
    - Suspicious email domains
    - No relevant experience mentioned
    - Excessive links or promotional content
    
    Return JSON:
    {
      "isSpam": true/false,
      "confidence": 0.0-1.0,
      "reasons": ["reason1", "reason2"]
    }
    `;
    
    try {
      const result = this.call(prompt, "Spam detection. Return JSON only.");
      return JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
      return { isSpam: false, confidence: 0, error: e.message };
    }
  }
};

/**
 * Test AI integration
 */
function testAI() {
  Logger.log('Testing AI integration...');
  
  try {
    const response = AI.call('Say "working" in one word');
    Logger.log('AI Response: ' + response);
    
    if (response && response.toLowerCase().includes('work')) {
      Logger.log('✅ AI test passed');
      return true;
    } else {
      Logger.log('⚠️ AI responded but unexpected: ' + response);
      return false;
    }
  } catch (e) {
    Logger.log('❌ AI test failed: ' + e.message);
    return false;
  }
}
