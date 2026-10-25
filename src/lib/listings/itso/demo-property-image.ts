/** Original illustration. It is not a photograph and not an MLS image. */
export function demoPropertyImageUrl(label: string, accent: string): string {
  const safeLabel = label.replace(/[<>&"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#0B1F3A"/><polygon points="210,190 320,100 430,190" fill="#F6F1E8"/><rect x="230" y="190" width="180" height="110" fill="${accent}"/><text x="320" y="340" text-anchor="middle" fill="#F6F1E8" font-family="Arial,sans-serif" font-size="28" font-weight="700">DEMO PROPERTY</text><text x="320" y="372" text-anchor="middle" fill="${accent}" font-family="Arial,sans-serif" font-size="16">${safeLabel}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
