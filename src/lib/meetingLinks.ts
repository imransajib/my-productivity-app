import { MeetingProvider } from './types';

export interface ExtractMeetingParams {
  hangoutLink?: string | null;
  conferenceData?: {
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
      [key: string]: any;
    }>;
    [key: string]: any;
  } | null;
  location?: string | null;
  description?: string | null;
  url?: string | null;
}

export interface ExtractedMeetingInfo {
  meetingUrl?: string;
  meetingProvider?: MeetingProvider;
}

/**
 * Detect the video meeting provider from a given URL.
 */
export function detectMeetingProvider(url: string): MeetingProvider {
  const lower = url.toLowerCase();
  if (lower.includes('meet.google.com')) return 'meet';
  if (lower.includes('zoom.us')) return 'zoom';
  if (lower.includes('teams.microsoft.com') || lower.includes('teams.live.com')) return 'teams';
  if (lower.includes('webex.com')) return 'webex';
  return 'other';
}

/**
 * Patterns matching major meeting platforms in free text:
 * Zoom, Teams, Webex, Google Meet
 */
const MEETING_URL_PATTERNS = [
  // Google Meet
  { regex: /https?:\/\/meet\.google\.com\/[a-zA-Z0-9_\-]+(?:\?[^\s"'<>\)]*)?/i, provider: 'meet' as const },
  // Zoom
  { regex: /https?:\/\/(?:[a-zA-Z0-9_\-]+\.)?zoom\.us\/(?:j\/[0-9]+|my\/[a-zA-Z0-9._\-]+|w\/[0-9]+|[a-zA-Z0-9_\-]+)[^\s"'<>\)]*/i, provider: 'zoom' as const },
  // Microsoft Teams
  { regex: /https?:\/\/teams\.(?:microsoft|live)\.com\/[^\s"'<>\)]+/i, provider: 'teams' as const },
  // Cisco Webex
  { regex: /https?:\/\/(?:[a-zA-Z0-9_\-]+\.)?webex\.com\/[^\s"'<>\)]+/i, provider: 'webex' as const },
];

/**
 * Searches a text string (such as location or description) for the first occurrence of a
 * Zoom / Teams / Webex / Meet URL.
 */
export function findMeetingUrlInText(text?: string | null): ExtractedMeetingInfo | null {
  if (!text || typeof text !== 'string') return null;

  let earliestMatch: { url: string; provider: MeetingProvider; index: number } | null = null;

  for (const { regex, provider } of MEETING_URL_PATTERNS) {
    const match = regex.exec(text);
    if (match) {
      const matchIndex = match.index;
      // Keep track of the earliest match in the string
      if (!earliestMatch || matchIndex < earliestMatch.index) {
        // Strip trailing punctuation if matched inadvertently
        let cleanUrl = match[0].replace(/[\.,;:!]+$/, '');
        earliestMatch = {
          url: cleanUrl,
          provider,
          index: matchIndex,
        };
      }
    }
  }

  if (earliestMatch) {
    return {
      meetingUrl: earliestMatch.url,
      meetingProvider: earliestMatch.provider,
    };
  }

  return null;
}

/**
 * Pure function to extract video meeting URL and provider with priority:
 * 1. hangoutLink (Google Meet)
 * 2. conferenceData.entryPoints (entryPointType === 'video')
 * 3. first Zoom/Teams/Webex/Meet URL found in `url`
 * 4. first Zoom/Teams/Webex/Meet URL found in `location`
 * 5. first Zoom/Teams/Webex/Meet URL found in `description`
 */
export function extractMeetingInfo(params: ExtractMeetingParams): ExtractedMeetingInfo {
  // 1. Prefer hangoutLink
  if (params.hangoutLink && typeof params.hangoutLink === 'string' && params.hangoutLink.trim()) {
    const trimmed = params.hangoutLink.trim();
    return {
      meetingUrl: trimmed,
      meetingProvider: detectMeetingProvider(trimmed),
    };
  }

  // 2. conferenceData.entryPoints (video type preferred)
  if (params.conferenceData?.entryPoints && Array.isArray(params.conferenceData.entryPoints)) {
    const videoEntry = params.conferenceData.entryPoints.find(
      (ep) => ep?.entryPointType?.toLowerCase() === 'video' && ep?.uri
    );
    if (videoEntry?.uri) {
      return {
        meetingUrl: videoEntry.uri,
        meetingProvider: detectMeetingProvider(videoEntry.uri),
      };
    }

    // Any entryPoint with URI if no explicit 'video' type
    const anyEntry = params.conferenceData.entryPoints.find((ep) => ep?.uri);
    if (anyEntry?.uri) {
      return {
        meetingUrl: anyEntry.uri,
        meetingProvider: detectMeetingProvider(anyEntry.uri),
      };
    }
  }

  // 3. Optional direct URL field (e.g. from ICS URL property)
  if (params.url && typeof params.url === 'string') {
    const urlMatch = findMeetingUrlInText(params.url);
    if (urlMatch) return urlMatch;
  }

  // 4. First Zoom/Teams/Webex/Meet URL found in location
  if (params.location && typeof params.location === 'string') {
    const locationMatch = findMeetingUrlInText(params.location);
    if (locationMatch) return locationMatch;
  }

  // 5. First Zoom/Teams/Webex/Meet URL found in description
  if (params.description && typeof params.description === 'string') {
    const descriptionMatch = findMeetingUrlInText(params.description);
    if (descriptionMatch) return descriptionMatch;
  }

  return {};
}

/**
 * Cleans a location string for physical map representation:
 * If the location is exclusively a meeting URL, returns undefined so it is not treated as a physical address.
 */
export function cleanLocation(location?: string | null, meetingUrl?: string | null): string | undefined {
  if (!location || typeof location !== 'string') return undefined;
  const trimmed = location.trim();
  if (!trimmed) return undefined;

  // If location is identical to the meeting URL, or purely a virtual meeting link
  if (meetingUrl && trimmed === meetingUrl) return undefined;
  if (/^https?:\/\/(?:[a-zA-Z0-9_\-]+\.)?(?:zoom\.us|meet\.google\.com|teams\.(?:microsoft|live)\.com|webex\.com)/i.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

/**
 * Returns a universal Google/Apple Maps search URL for a given location string.
 */
export function getMapsSearchUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.trim())}`;
}

/**
 * Formats user-friendly display name for a given meeting provider.
 */
export function getProviderDisplayName(provider?: MeetingProvider): string {
  switch (provider) {
    case 'meet':
      return 'Google Meet';
    case 'zoom':
      return 'Zoom';
    case 'teams':
      return 'Microsoft Teams';
    case 'webex':
      return 'Webex';
    default:
      return 'Meeting';
  }
}
