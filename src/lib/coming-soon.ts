/** Temporary public site gate — set COMING_SOON=1 (or true) to enable. */
export function isComingSoonEnabled() {
  const raw = process.env.COMING_SOON?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}
