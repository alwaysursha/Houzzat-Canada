import { DM_Sans, Fraunces, Playfair_Display } from "next/font/google";

const serif = Playfair_Display({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  variable: "--font-rc-serif",
  display: "swap",
});

const sans = DM_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-rc-sans",
  display: "swap",
});

/** Soft serif for the street address. OFL, so the number and the street can share one face. */
const address = Fraunces({
  subsets: ["latin"],
  display: "swap",
  axes: ["SOFT", "opsz"],
  variable: "--font-rc-address",
});

export const royalCollectionFonts = `${serif.variable} ${sans.variable} ${address.variable}`;
