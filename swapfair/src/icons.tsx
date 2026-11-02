type Props = { name: string; size?: number };

const paths: Record<string, string> = {
  search: "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4",
  home: "M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M14.8 9.2l-1.3 4.3-4.3 1.3 1.3-4.3 4.3-1.3Z",
  plus: "M12 5v14M5 12h14",
  trades: "M7 7h11l-1.2 8.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.6L6 4H3 M9 20h.1M16 20h.1",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
  bell: "M6 16V10a6 6 0 1 1 12 0v6l1.5 2H4.5L6 16ZM10 19a2 2 0 0 0 4 0",
  heart: "M12 19s-7-4.4-7-8.2A3.6 3.6 0 0 1 12 8a3.6 3.6 0 0 1 7 2.8C19 14.6 12 19 12 19Z",
  message: "M5 16.5 3.5 20 8 18.2A8.5 8.5 0 1 0 5 16.5Z",
  back: "M15 5 8 12l7 7",
  chevron: "M9 6l6 6-6 6",
  close: "M7 7l10 10M17 7 7 17",
  check: "M5 12.5 9.2 17 19 7",
  warn: "M12 4 3.5 19h17L12 4ZM12 10v4M12 16.5h.1",
  shield: "M12 3 5 6v6.2c0 4.2 2.8 6.8 7 8.3 4.2-1.5 7-4.1 7-8.3V6l-7-3Z",
  map: "M9 18 4 20V6l5-2 6 2 5-2v14l-5 2-6-2Z M9 4v14M15 6v14",
  grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
  star: "m12 3 2.4 5.2L20 9.2l-4 3.9.9 5.7L12 16.8 7.1 18.8 8 13.1 4 9.2l5.6-1L12 3Z",
  share: "M14 5h5v5M19 5l-8 8M9 7H6v12h12v-3",
  filter: "M4 6h16M7 12h10M10 18h4",
  send: "M4 12 20 4l-6 16-2.5-6.5L4 12Z",
  flag: "M6 21V4M6 5h10l-1.5 3L16 11H6",
  lock: "M8 11V8a4 4 0 0 1 8 0v3M7 11h10v9H7v-9Z",
  calendar: "M5 6h14v14H5V6ZM8 4v4M16 4v4M5 10h14",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 8h.1",
  ban: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM7 7l10 10",
  image: "M4 6h16v12H4V6Zm4 8 2.5-3 2 2.2L15 10l3 4",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  moon: "M16 14.5A6.5 6.5 0 0 1 9.2 5 7 7 0 1 0 16 14.5Z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9S14.5 18.2 12 21c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3Z",
  scale: "M12 4v16M8 20h8M12 7l7 3-7 1-7-1 7-3ZM5 10l-2 4h4l-2-4ZM19 10l-2 4h4l-2-4Z",
  camera: "M8 8 9.5 5h5L16 8h2.5A1.5 1.5 0 0 1 20 9.5v8A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5v-8A1.5 1.5 0 0 1 5.5 8H8Zm4 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  spark: "M12 3v4M12 17v4M4 12H3M21 12h-1M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2",
  truck: "M3 7h11v8H3V7Zm11 3h4l3 3v2h-7v-5ZM7 18a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  pin: "M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Zm0-8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  edit: "M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5Z",
};

export function Icon({ name, size = 22 }: Props) {
  const d = paths[name] ?? paths.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="currentColor" opacity="0.12" />
      <path d="M9 13h10.2L16.6 10.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M23 19H12.8l2.6 2.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
