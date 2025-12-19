/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║                 URBANMISTRII ORACLE v22.1 - CALENDAR                          ║
 * ║                 Google Calendar Integration                                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

const Calendar = {
  /**
   * Create an interview event on Google Calendar
   * @param {object} candidate - Candidate info
   * @param {Date} dateTime - Interview date/time
   * @param {number} durationMinutes - Interview duration (default 45)
   * @param {string} interviewerEmail - Interviewer's email (optional)
   * @returns {object} { success, eventId, eventUrl }
   */
  createInterview(candidate, dateTime, durationMinutes = 45, interviewerEmail = null) {
    try {
      if (SecureConfig.isTestMode()) {
        Logger.log(`[CALENDAR TEST] Would create interview for ${candidate.name} at ${dateTime}`);
        return { success: true, testMode: true, eventId: 'TEST_EVENT_ID' };
      }
      
      const calendar = CalendarApp.getDefaultCalendar();
      const endTime = new Date(dateTime.getTime() + durationMinutes * 60 * 1000);
      
      // Create event
      const event = calendar.createEvent(
        `🎯 Interview: ${candidate.name} (${candidate.role})`,
        dateTime,
        endTime,
        {
          description: this._generateDescription(candidate),
          location: 'UrbanMistrii Office / Google Meet',
          guests: this._getGuests(candidate.email, interviewerEmail),
          sendInvites: true
        }
      );
      
      // Set reminder
      event.addPopupReminder(30); // 30 minutes before
      event.addEmailReminder(60); // 1 hour before
      
      // Add color coding based on role
      const color = this._getRoleColor(candidate.role);
      event.setColor(color);
      
      Log.success('CALENDAR', 'Interview scheduled', {
        candidate: candidate.name,
        date: dateTime.toISOString(),
        eventId: event.getId()
      });
      
      return {
        success: true,
        eventId: event.getId(),
        eventUrl: event.getEventSeries ? null : `https://calendar.google.com/calendar/event?eid=${event.getId()}`
      };
      
    } catch (e) {
      Log.error('CALENDAR', 'Failed to create interview', { error: e.message });
      return { success: false, error: e.message };
    }
  },
  
  /**
   * Get available interview slots for a given date
   * @param {Date} date - The date to check
   * @param {number} slotDuration - Duration of each slot in minutes
   * @returns {Array} Array of available time slots
   */
  getAvailableSlots(date, slotDuration = 45) {
    try {
      const calendar = CalendarApp.getDefaultCalendar();
      
      // Define working hours (10 AM to 7 PM IST)
      const workStart = 10;
      const workEnd = 19;
      
      // Get all events for the day
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      const events = calendar.getEvents(startOfDay, endOfDay);
      
      // Generate all possible slots
      const slots = [];
      for (let hour = workStart; hour < workEnd; hour++) {
        for (let min = 0; min < 60; min += slotDuration) {
          if (hour === workEnd - 1 && min + slotDuration > 60) continue;
          
          const slotStart = new Date(date);
          slotStart.setHours(hour, min, 0, 0);
          const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
          
          // Check if slot conflicts with any event
          const isAvailable = !events.some(event => {
            const eventStart = event.getStartTime();
            const eventEnd = event.getEndTime();
            return (slotStart < eventEnd && slotEnd > eventStart);
          });
          
          if (isAvailable) {
            slots.push({
              start: slotStart,
              end: slotEnd,
              label: `${this._formatTime(slotStart)} - ${this._formatTime(slotEnd)}`
            });
          }
        }
      }
      
      return slots;
      
    } catch (e) {
      Log.error('CALENDAR', 'Failed to get slots', { error: e.message });
      return [];
    }
  },
  
  /**
   * Cancel/delete an interview event
   */
  cancelInterview(eventId, reason = '') {
    try {
      const calendar = CalendarApp.getDefaultCalendar();
      const event = calendar.getEventById(eventId);
      
      if (event) {
        event.setDescription(event.getDescription() + `\n\n❌ CANCELLED: ${reason}`);
        event.deleteEvent();
        
        Log.info('CALENDAR', 'Interview cancelled', { eventId, reason });
        return { success: true };
      }
      
      return { success: false, error: 'Event not found' };
      
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  /**
   * Reschedule an interview
   */
  rescheduleInterview(eventId, newDateTime) {
    try {
      const calendar = CalendarApp.getDefaultCalendar();
      const event = calendar.getEventById(eventId);
      
      if (event) {
        const duration = event.getEndTime() - event.getStartTime();
        event.setTime(newDateTime, new Date(newDateTime.getTime() + duration));
        
        Log.info('CALENDAR', 'Interview rescheduled', { eventId, newDate: newDateTime.toISOString() });
        return { success: true };
      }
      
      return { success: false, error: 'Event not found' };
      
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════════════
  //                              HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  _generateDescription(candidate) {
    return `
📋 CANDIDATE DETAILS
━━━━━━━━━━━━━━━━━━━━
Name: ${candidate.name}
Role: ${candidate.role}
Email: ${candidate.email}
Phone: ${candidate.phone || 'Not provided'}

📁 PORTFOLIO
${candidate.portfolioUrl || 'Not provided'}

📊 STATUS
${candidate.status || 'Interview Pending'}

🔗 QUICK LINKS
• View in Sheet: ${getSheetUrl()}
• HR Contact: ${CONFIG.TEAM.ADMIN_EMAIL}

━━━━━━━━━━━━━━━━━━━━
Generated by Oracle v22.0
    `.trim();
  },
  
  _getGuests(candidateEmail, interviewerEmail) {
    const guests = [CONFIG.TEAM.ADMIN_EMAIL];
    if (candidateEmail) guests.push(candidateEmail);
    if (interviewerEmail) guests.push(interviewerEmail);
    return guests.join(',');
  },
  
  _getRoleColor(role) {
    // Google Calendar colors (1-11)
    if (role.toLowerCase().includes('senior')) return '11'; // Red
    if (role.toLowerCase().includes('junior')) return '5';  // Yellow
    return '10'; // Green (Intern)
  },
  
  _formatTime(date) {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata'
    });
  }
};

/**
 * Test calendar integration
 */
function testCalendar() {
  Logger.log('Testing Calendar integration...');
  
  // Test getting available slots
  const tomorrow = DateTime.addDays(new Date(), 1);
  const slots = Calendar.getAvailableSlots(tomorrow);
  
  Logger.log(`Found ${slots.length} available slots for tomorrow`);
  if (slots.length > 0) {
    Logger.log('First slot: ' + slots[0].label);
  }
  
  // Test creating interview (in test mode)
  const testCandidate = {
    name: 'Test Candidate',
    email: 'test@example.com',
    phone: '9999999999',
    role: 'Junior Designer'
  };
  
  const result = Calendar.createInterview(testCandidate, slots[0]?.start || tomorrow);
  Logger.log('Create result: ' + JSON.stringify(result));
  
  Logger.log('✅ Calendar test completed');
}
