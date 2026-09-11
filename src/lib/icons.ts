/** Coherent inline icon set — 1.75px stroke, 24px grid, rounded caps. */

const PATHS: Record<string, string> = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5M9.5 21v-6h5v6',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15.5H6.5A2.5 2.5 0 0 0 4 21V5.5Zm0 0A2.5 2.5 0 0 0 6.5 8H20M4 17.5A2.5 2.5 0 0 1 6.5 15H20',
  'book-open': 'M12 6.5C10.5 5 8.5 4.5 4 4.5v14c4.5 0 6.5.5 8 2 1.5-1.5 3.5-2 8-2v-14c-4.5 0-6.5.5-8 2Zm0 0v14M4 8.5h0',
  layers: 'm12 3 9 4.5-9 4.5-9-4.5L12 3Zm-9 9 9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11Zm0 3a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z',
  refresh: 'M4 12a8 8 0 0 1 14-4.5L20 10M20 4v6h-6M20 12a8 8 0 0 1-14 4.5L4 14M4 20v-6h6',
  chart: 'M4 4v16h16M8 16v-5M12 16V8M16 16v-3',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5v-13ZM4 9.5h16M8 3v4M16 3v4',
  chat: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.5 4v-4A2.5 2.5 0 0 1 4 14.5v-8Z',
  settings: 'M12 8.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4ZM19 13.5v-3l-2.1-.6a6 6 0 0 0-.6-1.4l1-1.9-2.1-2.1-1.9 1a6 6 0 0 0-1.4-.6L11 2.8H8l-.6 2.1a6 6 0 0 0-1.4.6l-1.9-1L2 6.6l1 1.9a6 6 0 0 0-.6 1.4L0.3 10.5v3l2.1.6c.1.5.3 1 .6 1.4l-1 1.9 2.1 2.1 1.9-1c.4.3.9.5 1.4.6l.6 2.1h3l.6-2.1c.5-.1 1-.3 1.4-.6l1.9 1 2.1-2.1-1-1.9c.3-.4.5-.9.6-1.4l2.1-.6Z',
  plus: 'M12 5v14M5 12h14',
  search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.2-4.2',
  'chevron-left': 'M14.5 6 8.5 12l6 6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  'chevron-down': 'M6 9.5l6 6 6-6',
  x: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7',
  flag: 'M5 21V4m0 1c3-1.5 7 1.5 11 0v10c-4 1.5-8-1.5-11 0',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5v4.5l3 2',
  flame: 'M12 21c4-1.5 6.5-4.5 6.5-8.5 0-3-1.5-5.5-4-7.5C14 8.5 13 10 12 10c0-3 0-5.5-2.5-7.5C6.5 5 5 7.5 5 10c0 3 1 6 3 8-1.5-1-2-2.5-2-4 1.5 3 3.5 5 6 7Z',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 7v6m0-9.5v.5',
  alert: 'M12 4 2.5 19.5h19L12 4Zm0 5.5V14m0 2.5v.5',
  'arrow-right': 'M4 12h16m-6-6 6 6-6 6',
  'arrow-left': 'M20 12H4m6-6-6 6 6 6',
  mic: 'M12 4a2.5 2.5 0 0 0-2.5 2.5v5A2.5 2.5 0 0 0 12 14a2.5 2.5 0 0 0 2.5-2.5v-5A2.5 2.5 0 0 0 12 4ZM5 11a7 7 0 0 0 14 0M12 18v3',
  pen: 'M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1ZM13.5 7.5l3 3',
  layers2: 'm12 3 9 4.5-9 4.5-9-4.5L12 3ZM3 12l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  map: 'M9 5 3 7.5v12L9 17l6 2.5 6-2.5v-12L15 7.5 9 5Zm6 12V7.5M9 5v12',
  download: 'M12 4v11m-4.5-4.5L12 15l4.5-4.5M4 19.5h16',
  upload: 'M12 15V4m-4.5 4.5L12 4l4.5 4.5M4 19.5h16',
  moon: 'M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z',
  sun: 'M12 4.5V2m0 20v-2.5M4.5 12H2m20 0h-2.5M6 6 4.2 4.2m15.6 15.6L18 18M6 18l-1.8 1.8M19.8 4.2 18 6m-6 0a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',
  trash: 'M4.5 7h15M9.5 7V4.5h5V7m-8 0 .7 13h9.6l.7-13M10 11v5M14 11v5',
  edit: 'M4 20l1.2-4.6L16.8 3.8a2 2 0 0 1 2.9 0l.5.5a2 2 0 0 1 0 2.9L8.6 18.8 4 20ZM13.8 6.8l3.4 3.4',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'M8 5.5v13l11-6.5-11-6.5Z',
  pause: 'M8 5v14M16 5v14',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
  eyeOff: 'M4 4l16 16M9.9 6.2A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.5 17.5 0 0 1-3.2 4M6.1 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.3 3.3-.7',
  brain: 'M9.5 4A2.5 2.5 0 0 0 7 6.5v3.2a2.6 2.6 0 0 0-3.5 2.4v.3a2.5 2.5 0 0 0 1.4 2.2 2.6 2.6 0 0 0 4.6 2.4 2.5 2.5 0 0 0 4 0 2.6 2.6 0 0 0 4.6-2.4 2.5 2.5 0 0 0 1.4-2.2v-.3A2.6 2.6 0 0 0 17 9.7V6.5A2.5 2.5 0 0 0 14.5 4',
  zap: 'M13 2 4.5 13.5H11L10 22l8.5-11.5H13L13 2Z',
  award: 'M12 4.5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm-3.5 13.5L7 21l2-1.5L12 21l3-1.5 2 1.5-1.5-3',
  gift: 'M4 9.5h16V20H4V9.5ZM4 9.5c0-4 4-4 5.5-2.5S11 13 12 9.5C13 6 18 5 20 9.5M12 9.5V20',
  grid: 'M4 4h6.5v6.5H4V4Zm9.5 0H20v6.5h-6.5V4ZM4 13.5h6.5V20H4v-6.5Zm9.5 0H20V20h-6.5v-6.5Z',
  sparkle: 'M12 3.5 13.7 9l5.3 1.7-5.3 1.7L12 18l-1.7-5.6L5 10.7 10.3 9 12 3.5ZM19 16.5l.8 2.4 2.4.8-2.4.8-.8 2.4-.8-2.4-2.4-.8 2.4-.8.8-2.4Z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.8 5.2-2 5.6-5.6 2 2-5.6 5.6-2Z',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.5 16a6 6 0 0 1 7 0M12 19.5h.01',
  wifiOff: 'M4 4l16 16M8.5 16a6 6 0 0 1 7 0M5.5 12.5c1-.8 2-1.4 3.2-1.8M2.5 9a14 14 0 0 1 4-2.6M19 9c1.2.9 2.3 2 3.5 3.5M18.8 12.4c.8.6 1.5 1.3 2.2 2.1M9.5 4.4A14 14 0 0 1 21.5 9',
  key: 'M14.5 3a6.5 6.5 0 0 0-5.8 9.7L3 18.4V21h2.6l1.9-1.9v-2.6h2.6l1.9-1.9h2.5l1-1a6.5 6.5 0 1 0-1-10.6ZM17 7h.01',
  wand: 'M15 4V2m0 20v-2m7-9h2M2 13h2m12.2-6.2 1.4-1.4M3.4 19.8l1.4-1.4m9.9-9.9 1.4 1.4M3.4 4.2 4.8 5.6M14 4.5 19.5 10 7 22.5 1.5 17 14 4.5Z',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  quote: 'M4 12c0-3.5 2-6 5.5-6.8L10 6.5C8 7.5 6.5 9 6.5 11c.7-.2 1.4.2 1.6 1 .2.8-.3 1.5-1 1.5A2.3 2.3 0 0 1 4 12Zm10 0c0-3.5 2-6 5.5-6.8l.5 1.3c-2 1-3.5 2.5-3.5 4.5.7-.2 1.4.2 1.6 1 .2.8-.3 1.5-1 1.5a2.3 2.3 0 0 1-3.1-2Z',
  text: 'M5 5.5h14M12 5.5V20M8.5 20h7',
  shuffle: 'M4 7h3c5 0 8 3 13 3m0 0-3 3m3-3-3-3M4 17h3c2 0 3.5-1 5-3.5M4 17h3c5 0 9-3 13-6m0 0-3-3m3 3-3 3',
  hourglass: 'M6 3h12M6 21h12M7 3c0 4 5 5.5 5 9s-5 5-5 9M17 3c0 4-5 5.5-5 9s5 5 5 9',
  bell: 'M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Zm4 9a2.2 2.2 0 0 0 4 0',
  link: 'M10 14a4 4 0 0 0 6 1l3-3a4 4 0 0 0-6-6l-1.5 1.5M14 10a4 4 0 0 0-6-1l-3 3a4 4 0 0 0 6 6l1.5-1.5',
  server: 'M4 4h16v6H4V4Zm0 10h16v6H4v-6ZM7.5 7h.01M7.5 17h.01',
  bulb: 'M9 18h6m-5 3h4M12 3a6.5 6.5 0 0 0-3.5 12c.8.5 1.5 1.3 1.5 2.5V18a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-.5c0-1.2.7-2 1.5-2.5A6.5 6.5 0 0 0 12 3Z',
  'shield-check': 'M12 3 5 5.8v5.4c0 4.3 3 7.8 7 9.3 4-1.5 7-5 7-9.3V5.8L12 3Zm-3.2 8.5 2.2 2.2 4.4-4.4',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 10.5a3 3 0 1 0 0-6M21 20v-1.5a4 4 0 0 0-2.8-3.8',
  sliders: 'M4 6h10m4 0h2M4 12h2m4 0h10M4 18h10m4 0h2M14 4v4M10 10v4M14 16v4',
};

export type IconName = keyof typeof PATHS;

export function icon(name: string, size = 18, cls?: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const d = PATHS[name];
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d ?? PATHS.info!);
  svg.appendChild(path);
  return svg;
}

/** The StudyBuddy wordmark glyph: an open book whose pages form a rising path. */
export function logoMark(size = 30): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const paths = [
    // open book
    'M5 7a3 3 0 0 1 3-3h17v20h-17a3 3 0 0 0-3 3V7Z',
    'M25 24h-6.5c-3 0-5 2.2-5 5V4c0-2.8 2-5 5-5H25',
    // rising path (the "what next" arrow)
    'M12 24h5l-2.5-4h4l-3.5-5.5-3.5 5.5h4L13 24Z',
  ];
  for (const d of paths) {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(p);
  }
  return svg;
}
