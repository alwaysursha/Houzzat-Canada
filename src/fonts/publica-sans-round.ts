import localFont from "next/font/local";

/** Publica Sans Round Ultra Light. Listing Detail body face. */
export const publicaSansRoundUlLt = localFont({
  src: "./PublicaSansRound-UlLt.otf",
  weight: "250",
  style: "normal",
  variable: "--font-publica-ullt",
  display: "swap",
  adjustFontFallback: false,
});

/** Publica Sans Round Medium. Listing Detail emphasis face. */
export const publicaSansRoundMd = localFont({
  src: "./PublicaSansRound-Md.otf",
  weight: "500",
  style: "normal",
  variable: "--font-publica-md",
  display: "swap",
  adjustFontFallback: false,
});

export const listingDetailFontVariables = `${publicaSansRoundUlLt.variable} ${publicaSansRoundMd.variable}`;

/** Scope class. Does not change type outside this subtree. */
export const listingDetailTypeClass = "listing-detail-type";
