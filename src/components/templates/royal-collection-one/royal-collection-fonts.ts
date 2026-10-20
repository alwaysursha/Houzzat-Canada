import { DM_Sans, Playfair_Display } from "next/font/google";

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

export const royalCollectionFonts = `${serif.variable} ${sans.variable}`;
