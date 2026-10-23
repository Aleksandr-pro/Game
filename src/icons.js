const PATHS = {
  home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 5.5v14"/><path d="M8 7h8M8 11h6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  flame: '<path d="M12 22c4 0 7-2.8 7-7 0-3-1.8-5.8-5.2-9.4.2 3-1.2 4.5-2.2 5.4.2-4-2.2-6.8-4.2-9C7.6 7 5 9.8 5 15c0 4.2 3 7 7 7Z"/><path d="M9.5 18c0-2 1.3-3 2.5-5 1.2 2 2.5 3 2.5 5a2.5 2.5 0 0 1-5 0Z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  right: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  left: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sparkle: '<path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  calculator: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8v3H8zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  variable: '<path d="M4 5h5l6 14h5M4 19l6-7M15 5l5 7"/>',
  shapes: '<rect x="3" y="3" width="9" height="9" rx="1"/><circle cx="16.5" cy="16.5" r="4.5"/><path d="m16 3 5 8h-10z"/>',
  percent: '<path d="m19 5-14 14"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
  puzzle: '<path d="M19 13h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H7v-4H5a2 2 0 1 1 0-4h2V9H3V5h4V3h4v2a2 2 0 1 0 4 0V3h4v4h2a2 2 0 1 1 0 4h-2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  bulb: '<path d="M9 18h6M10 22h4M8.5 15.5A7 7 0 1 1 15.5 15.5c-.9.7-1.5 1.4-1.5 2.5h-4c0-1.1-.6-1.8-1.5-2.5Z"/>',
  flag: '<path d="M5 22V3M5 4h12l-2 4 2 4H5"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="m8.5 13-1.5 9 5-3 5 3-1.5-9"/><path d="m10 8 1.3 1.3L14.5 6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  trend: '<path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  brain: '<path d="M9.5 4A3.5 3.5 0 0 0 6 7.5c0 .3 0 .6.1.9A4 4 0 0 0 4 15c0 1.5.8 2.8 2 3.4A3.5 3.5 0 0 0 12 21V5a3 3 0 0 0-2.5-1ZM14.5 4A3.5 3.5 0 0 1 18 7.5c0 .3 0 .6-.1.9A4 4 0 0 1 20 15c0 1.5-.8 2.8-2 3.4A3.5 3.5 0 0 1 12 21"/><path d="M6 8.5h2M4.5 14H8M16 8.5h2M16 14h3.5M9 18H6M15 18h3"/>',
  star: '<path d="m12 2 3 6.1 6.7 1-4.9 4.7 1.2 6.7-6-3.1-6 3.1 1.2-6.7-4.9-4.7 6.7-1z"/>',
  circlecheck: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v2a4 4 0 0 0 4 4M16 6h4v2a4 4 0 0 1-4 4M12 13v5M8 22h8M9 18h6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.8-1L20 12M4 12l2.1 5a7 7 0 0 0 11.8-1"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M10 17l5-5-5-5M15 12H3M15 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>'
};

export function icon(name, size = 20, className = '') {
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || PATHS.sparkle}</svg>`;
}

export function brandMark(size = 38) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 42 42" fill="none" aria-hidden="true"><rect width="42" height="42" rx="13" fill="currentColor"/><path d="M11 28.5h7v-7h7v-7h7" stroke="white" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="13" r="3" fill="#DDF67A"/></svg>`;
}
