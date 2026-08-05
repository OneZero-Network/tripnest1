// A trip's "cover" is a gradient + emoji chosen by matching keywords in the trip name
// against common destination types — not a photo. Two reasons: (1) real photography would
// mean either bundling a large asset library that still wouldn't cover every place, or
// calling a network image API on every trip name typed — the second one quietly breaks
// "100% Private & Offline, no tracking," which is a promise made explicitly elsewhere in
// this app, not a detail to trade away for a nicer-looking card. (2) This still delivers
// the actual goal — "make it feel like this trip, not a generic template" — without either
// tradeoff. Falls back to a neutral trip theme for anything that doesn't match a keyword.
const THEMES = [
  { keywords: ['goa', 'beach', 'bali', 'maldives', 'island', 'coast'], emoji: '🏖️', colors: ['#0E7C86', '#1FA8A0'] },
  { keywords: ['manali', 'shimla', 'mountain', 'hill', 'trek', 'himalaya', 'alps'], emoji: '🏔️', colors: ['#3B5F7D', '#5B7C99'] },
  { keywords: ['delhi', 'mumbai', 'bangalore', 'city', 'newyork', 'london', 'paris', 'tokyo', 'dubai'], emoji: '🏙️', colors: ['#4A4E69', '#6B6F94'] },
  { keywords: ['forest', 'jungle', 'wildlife', 'safari', 'national park'], emoji: '🌲', colors: ['#2E6B4F', '#3F8A66'] },
  { keywords: ['desert', 'rajasthan', 'jaisalmer', 'sahara'], emoji: '🏜️', colors: ['#B4790B', '#D49A2E'] },
  { keywords: ['lake', 'river', 'kerala', 'backwater'], emoji: '🚤', colors: ['#1F6F8B', '#3D93B0'] },
  { keywords: ['ski', 'snow', 'winter'], emoji: '⛷️', colors: ['#4C6A8A', '#7C9BB8'] },
];
const DEFAULT_THEME = { emoji: '✈️', colors: ['#0E7C86', '#155E63'] };

export function getTripCoverTheme(tripName) {
  const name = (tripName || '').toLowerCase();
  const match = THEMES.find((t) => t.keywords.some((k) => name.includes(k)));
  return match || DEFAULT_THEME;
}
