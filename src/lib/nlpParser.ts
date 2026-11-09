import { Priority, ParsedNLPResult } from './types';

export function parseNaturalLanguageInput(rawInput: string): ParsedNLPResult {
  let text = rawInput.trim();
  let type: 'task' | 'event' = 'task';
  let date: string | undefined = undefined;
  let time: string | undefined = undefined;
  let durationMin: number | undefined = undefined;
  let priority: Priority | undefined = undefined;

  // 1. Detect Priority (e.g. !urgent, !high, !med, !low, p1, p2, p3)
  const priorityRegex = /(?:!|#)(urgent|high|medium|med|low)|(?:^|\s)(p1|p2|p3|p4)(?:\s|$)/i;
  const pMatch = text.match(priorityRegex);
  if (pMatch) {
    const val = (pMatch[1] || pMatch[2]).toLowerCase();
    if (val === 'urgent' || val === 'p1') priority = 'urgent';
    else if (val === 'high' || val === 'p2') priority = 'high';
    else if (val === 'medium' || val === 'med' || val === 'p3') priority = 'medium';
    else if (val === 'low' || val === 'p4') priority = 'low';

    text = text.replace(pMatch[0], ' ');
  }

  // 2. Detect Duration (e.g. for 45m, for 1h, 30 mins, 2 hours)
  const durRegex = /(?:for\s+)?(\d+(?:\.\d+)?)\s*(m|min|mins|minutes|h|hr|hrs|hours)(?:\b|$)/i;
  const durMatch = text.match(durRegex);
  if (durMatch) {
    const amount = parseFloat(durMatch[1]);
    const unit = durMatch[2].toLowerCase();
    if (unit.startsWith('h')) {
      durationMin = Math.round(amount * 60);
    } else {
      durationMin = Math.round(amount);
    }
    text = text.replace(durMatch[0], ' ');
  }

  // 3. Detect Time (e.g. at 10 AM, at 3:30pm, 14:00, 10am)
  const timeRegex = /(?:(?:at|@)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
  const timeMatches = Array.from(text.matchAll(new RegExp(timeRegex, 'gi')));
  for (const match of timeMatches) {
    const rawMatch = match[0].trim();
    // avoid matching single digits unless preceded by at/@ or followed by am/pm or has minutes
    if (!match[3] && !match[2] && !rawMatch.toLowerCase().startsWith('at') && !rawMatch.startsWith('@')) {
      continue;
    }
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridian = match[3] ? match[3].toLowerCase() : null;

    if (meridian === 'pm' && hours < 12) hours += 12;
    if (meridian === 'am' && hours === 12) hours = 0;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      time = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      text = text.replace(match[0], ' ');
      break;
    }
  }

  // 4. Detect Date (today, tomorrow, day of week, or YYYY-MM-DD, or MM/DD)
  const now = new Date();
  const todayIso = now.toISOString().split('T')[0];

  const dateKeywords: { [k: string]: number } = {
    today: 0,
    tonight: 0,
    tomorrow: 1,
  };

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const dateKeywordRegex = /\b(today|tonight|tomorrow)\b/i;
  const dkMatch = text.match(dateKeywordRegex);
  if (dkMatch) {
    const offset = dateKeywords[dkMatch[1].toLowerCase()];
    const target = new Date(now);
    target.setDate(target.getDate() + offset);
    date = target.toISOString().split('T')[0];
    text = text.replace(dkMatch[0], ' ');
  } else {
    // Check weekday (e.g. "on friday", "next monday")
    const weekdayRegex = /\b(?:on\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const wdMatch = text.match(weekdayRegex);
    if (wdMatch) {
      const targetDay = daysOfWeek.indexOf(wdMatch[1].toLowerCase());
      const currentDay = now.getDay();
      let dayDiff = (targetDay - currentDay + 7) % 7;
      if (dayDiff === 0) dayDiff = 7; // next week if same day
      const target = new Date(now);
      target.setDate(target.getDate() + dayDiff);
      date = target.toISOString().split('T')[0];
      text = text.replace(wdMatch[0], ' ');
    } else {
      // Check ISO format YYYY-MM-DD
      const isoRegex = /\b(\d{4}-\d{2}-\d{2})\b/;
      const isoMatch = text.match(isoRegex);
      if (isoMatch) {
        date = isoMatch[1];
        text = text.replace(isoMatch[0], ' ');
      }
    }
  }

  // 5. Default date if time is specified and date is not
  if (time && !date) {
    date = todayIso;
  }

  // 6. Determine type: task vs event
  const eventKeywords = /\b(meeting|call|sync|seminar|webinar|appointment|conference|standup|interview|coffee|dinner|session|demo)\b/i;
  if (eventKeywords.test(text) || (time && !text.match(/\b(buy|todo|finish|fix|complete|write|study|read|submit)\b/i))) {
    if (eventKeywords.test(rawInput)) {
      type = 'event';
    }
  }

  // Clean title
  let cleanTitle = text.replace(/\s+/g, ' ').trim();
  if (!cleanTitle) {
    cleanTitle = rawInput.trim();
  }

  return {
    type,
    title: cleanTitle,
    date,
    time,
    durationMin,
    priority,
  };
}
