/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                      URBANMISTRII ORACLE v22.1 - AI                           ║
 * ║                      Gemini + GitHub Models + Groq + OpenRouter               ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const AI = {
  /**
   * Main LLM Call Router - Quad fallback: Gemini → GitHub Models → Groq → OpenRouter
   */
  call(prompt, systemInstruction = "You are a helpful HR assistant.") {
    if (SecureConfig.isTestMode()) {
      Logger.log('[AI TEST] Prompt: ' + prompt.substring(0, 50) + '...');
      return "AI_TEST_RESPONSE";
    }

    // Try Gemini first
    try {
      return this._callGemini(prompt, systemInstruction);
    } catch (e) {
      Log.warn("AI", "Gemini failed, trying GitHub Models", { error: e.message });

      // Try GitHub Models second (free GPT-4o-mini)
      try {
        return this._callGitHubModels(prompt, systemInstruction);
      } catch (e2) {
        Log.warn("AI", "GitHub Models failed, trying Groq", { error: e2.message });

        // Try Groq third (fast & free)
        try {
          return this._callGroq(prompt, systemInstruction);
        } catch (e3) {
          Log.warn("AI", "Groq failed, trying OpenRouter", { error: e3.message });

          // Try OpenRouter last
          try {
            return this._callOpenRouter(prompt, systemInstruction);
          } catch (e4) {
            Log.error("AI", "Critical: All AI models failed", { error: e4.message });
            throw e4;
          }
        }
      }
    }
  },

  _callGemini(prompt, system) {
    const key = SecureConfig.getOptional('GEMINI_API_KEY');
    if (!key) throw new Error('Gemini API key not configured');

    // Use auto-detected working model, or fall back to config
    const props = PropertiesService.getScriptProperties();
    const model = props.getProperty('GEMINI_MODEL') || CONFIG.AI.MODELS.PRIMARY;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    const payload = {
      contents: [{
        parts: [{ text: system + "\n\n" + prompt }]
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
    const rawContent = response.getContentText();
    let json;

    try {
      json = JSON.parse(rawContent);
    } catch (e) {
      throw new Error(`Failed to parse Gemini response: ${rawContent.substring(0, 500)}`);
    }

    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

    const text = this._safePath(json, ['candidates', 0, 'content', 'parts', 0, 'text']);
    if (!text) {
      throw new Error(`Invalid candidate structure from Gemini. Raw: ${rawContent.substring(0, 500)}`);
    }

    return text;
  },

  /**
   * GitHub Models API - Free GPT-4o-mini via GitHub PAT
   */
  _callGitHubModels(prompt, system) {
    const key = SecureConfig.getOptional('GITHUB_PAT');
    if (!key) throw new Error('GitHub PAT not configured');

    const url = "https://models.github.ai/inference/chat/completions";

    const payload = {
      model: "openai/gpt-4o-mini",  // Free, fast, high quality
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      max_tokens: CONFIG.AI.MAX_TOKENS
    };

    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const rawContent = response.getContentText();
    let json;

    try {
      json = JSON.parse(rawContent);
    } catch (e) {
      throw new Error(`Failed to parse GitHub Models response: ${rawContent.substring(0, 500)}`);
    }

    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

    const text = this._safePath(json, ['choices', 0, 'message', 'content']);
    if (!text) {
      throw new Error(`Invalid response structure from GitHub Models. Raw: ${rawContent.substring(0, 500)}`);
    }
    return text;
  },

  /**
   * Groq API - Fast & Free fallback
   */
  _callGroq(prompt, system) {
    const key = SecureConfig.getOptional('GROQ_API_KEY');
    if (!key) throw new Error('Groq API key not configured');

    const url = "https://api.groq.com/openai/v1/chat/completions";

    const payload = {
      model: "llama-3.3-70b-versatile",  // Fast, free, high quality
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      temperature: CONFIG.AI.TEMPERATURE,
      max_tokens: CONFIG.AI.MAX_TOKENS
    };

    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const rawContent = response.getContentText();
    let json;

    try {
      json = JSON.parse(rawContent);
    } catch (e) {
      throw new Error(`Failed to parse Groq response: ${rawContent.substring(0, 500)}`);
    }

    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

    const text = this._safePath(json, ['choices', 0, 'message', 'content']);
    if (!text) {
      throw new Error(`Invalid response structure from Groq. Raw: ${rawContent.substring(0, 500)}`);
    }
    return text;
  },

  _callOpenRouter(prompt, system) {
    const key = SecureConfig.getOptional('OPENROUTER_API_KEY');
    if (!key) throw new Error('OpenRouter API key not configured');

    const url = "https://openrouter.ai/api/v1/chat/completions";

    const payload = {
      model: CONFIG.AI.MODELS.FALLBACK,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    };

    const options = {
      method: "post",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    const rawContent = response.getContentText();
    let json;

    try {
      json = JSON.parse(rawContent);
    } catch (e) {
      throw new Error(`Failed to parse OpenRouter response: ${rawContent.substring(0, 500)}`);
    }

    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));

    const text = this._safePath(json, ['choices', 0, 'message', 'content']);
    if (!text) {
      throw new Error(`Invalid response structure from OpenRouter. Raw: ${rawContent.substring(0, 500)}`);
    }
    return text;
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
    - TEST_SUBMISSION (Uses words like 'submitted', 'test', 'task', attached files with design work)
    - NEW_APPLICATION (First time applying for a job, sharing portfolio/resume WITHOUT answering specific questions)
    - FORM_RESPONSE (Candidate replying with structured answers like: name, email, phone, city, salary, experience, availability dates - filling out application details)
    - FOLLOWUP (Asking about status, or previous conversation)
    - QUESTION (Asking specific question about process/company that can be auto-answered)
    - ESCALATE (Reschedule requests, date changes, salary negotiations, angry, urgent, complaints, anything needing human attention)
    - SPAM (Marketing, irrelevant)

    IMPORTANT: 
    - If email contains structured Q&A pairs like "Current City: X", "Name: Y", "Salary: Z" - it's FORM_RESPONSE
    - Any request to reschedule, change dates, or modify interview/test timing should be ESCALATE.

    Return ONLY JSON:
    {
      "intent": "CATEGORY",
      "confidence": 0.0-1.0,
      "name": "Extracted Name if available",
      "role": "Extracted Role if available (Intern/Junior/Senior)"
    }
    `;

    let result = null;
    try {
      result = this.call(prompt, "You are an JSON extraction bot.");
      if (!result || typeof result !== 'string' || result === "AI_TEST_RESPONSE") return null;
      // Clean markdown code blocks if present
      const cleanJson = result.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      Log.error("AI", "Intent analysis failed", { error: e.message, result: result });
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

  /**
   * Extract structured form response data from candidate email
   * Parses emails where candidates reply with their details in Q&A format
   */
  extractFormResponse(body, senderEmail) {
    const prompt = `
    Extract ALL candidate details from this structured email response.
    The candidate is replying with their information.
    
    Email body:
    ${body}
    
    Extract and return JSON with these fields (use null if not found):
    {
      "name": "Full Name",
      "email": "${senderEmail}",
      "phone": "Phone Number",
      "city": "Current City",
      "role": "Desired Position/Role",
      "degree": "Degree/Education",
      "startDate": "Earliest Start Date",
      "tenure": "Expected Tenure",
      "salaryExpected": "Salary Expectations",
      "salaryLast": "Last Drawn Salary",
      "experience": "Work Experience description",
      "hindiProficient": "Yes/No",
      "healthNotes": "Health Considerations",
      "previousApplication": "Yes/No if applied before",
      "testAvailability": "Preferred test date/time",
      "willingToRelocate": "Yes/No",
      "portfolioUrl": "Portfolio link if any",
      "cvUrl": "CV/Resume link if any"
    }
    
    IMPORTANT: Extract exact values from the email. Don't make up data.
    `;

    try {
      const res = this.call(prompt, "You extract structured data from emails. Return valid JSON only.");
      const parsed = JSON.parse(res.replace(/```json/g, '').replace(/```/g, '').trim());
      // Ensure email is set
      parsed.email = parsed.email || senderEmail;
      return parsed;
    } catch (e) {
      Log.error('AI', 'Failed to extract form response', { error: e.message });
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
    You are a hiring assistant for Urbanmistrii, a design studio.
    Write a SHORT, HELPFUL reply to this candidate's email.
    
    Candidate: ${context.name}
    Role Applied: ${context.role}
    Current Status: ${context.status}
    
    Their message: "${questionText}"
    
    CRITICAL RULES:
    - Write the ACTUAL reply text, ready to send.
    - Be warm, professional, and specific.
    - Keep it 2-3 sentences maximum.
    - NEVER use placeholders like [date], [time], [your name], etc.
    - NEVER ask them to fill in blanks.
    - If they ask about dates/times and you don't know, say "Our team will get back to you shortly with specific timing."
    - If status is NEW, say their application is under review (1-2 days).
    - If status is TEST_SENT, encourage them to complete and submit.
    - If status is TEST_SUBMITTED or UNDER_REVIEW, say their work is being evaluated (2-3 days).
    - Sign off as "Hiring Team, Urbanmistrii"
    
    Reply:
    `;

    const reply = this.call(prompt);

    // Safety check - reject if response contains obvious placeholders
    if (reply && (reply.includes('[') || reply.includes('proposed date'))) {
      Log.warn('AI', 'Rejected AI reply with placeholders', { reply: reply.substring(0, 100) });
      return null; // This will trigger escalation to human
    }

    return reply;
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
  },

  /**
   * Safe path navigation for nested objects
   */
  _safePath(obj, path) {
    return path.reduce((xs, x) => (xs && xs[x] !== undefined && xs[x] !== null) ? xs[x] : null, obj);
  }
};

/**
 * Test AI integration - Tests each model individually
 */
function testAI() {
  Logger.log('╔═══════════════════════════════════════════════════════════════════╗');
  Logger.log('║         AI MODEL DIAGNOSTICS                                      ║');
  Logger.log('╚═══════════════════════════════════════════════════════════════════╝');

  let geminiOk = false;
  let githubOk = false;
  let groqOk = false;
  let openrouterOk = false;

  // Test Gemini
  Logger.log('');
  Logger.log('🔷 Testing GEMINI (gemini-2.0-flash)...');
  try {
    const response = AI._callGemini('Say "working" in one word', 'Respond briefly.');
    if (response) {
      Logger.log('   ✅ GEMINI: Working');
      Logger.log('   Response: ' + response.substring(0, 50));
      geminiOk = true;
    }
  } catch (e) {
    Logger.log('   ❌ GEMINI: ' + e.message.substring(0, 100));
  }

  // Test GitHub Models
  Logger.log('');
  Logger.log('🟣 Testing GITHUB MODELS (gpt-4o-mini)...');
  try {
    const response = AI._callGitHubModels('Say "working" in one word', 'Respond briefly.');
    if (response) {
      Logger.log('   ✅ GITHUB: Working');
      Logger.log('   Response: ' + response.substring(0, 50));
      githubOk = true;
    }
  } catch (e) {
    Logger.log('   ❌ GITHUB: ' + e.message.substring(0, 100));
  }

  // Test Groq
  Logger.log('');
  Logger.log('🟢 Testing GROQ (llama-3.3-70b)...');
  try {
    const response = AI._callGroq('Say "working" in one word', 'Respond briefly.');
    if (response) {
      Logger.log('   ✅ GROQ: Working');
      Logger.log('   Response: ' + response.substring(0, 50));
      groqOk = true;
    }
  } catch (e) {
    Logger.log('   ❌ GROQ: ' + e.message.substring(0, 100));
  }

  // Test OpenRouter
  Logger.log('');
  Logger.log('🟠 Testing OPENROUTER...');
  try {
    const response = AI._callOpenRouter('Say "working" in one word', 'Respond briefly.');
    if (response) {
      Logger.log('   ✅ OPENROUTER: Working');
      Logger.log('   Response: ' + response.substring(0, 50));
      openrouterOk = true;
    }
  } catch (e) {
    Logger.log('   ❌ OPENROUTER: ' + e.message.substring(0, 100));
  }

  // Summary
  Logger.log('');
  Logger.log('═══════════════════════════════════════════════════════════════════');
  Logger.log('SUMMARY:');
  Logger.log(`   GEMINI:      ${geminiOk ? '✅ Working' : '❌ Not working'}`);
  Logger.log(`   GITHUB:      ${githubOk ? '✅ Working' : '❌ Not working'}`);
  Logger.log(`   GROQ:        ${groqOk ? '✅ Working' : '❌ Not working'}`);
  Logger.log(`   OPENROUTER:  ${openrouterOk ? '✅ Working' : '❌ Not working'}`);
  Logger.log('');

  if (geminiOk || githubOk || groqOk || openrouterOk) {
    Logger.log('🎉 AI System: OPERATIONAL');
    Logger.log('   At least one model is working!');
    return true;
  } else {
    Logger.log('🚨 AI System: DOWN');
    Logger.log('   No models are working. Check API keys!');
    return false;
  }
}
