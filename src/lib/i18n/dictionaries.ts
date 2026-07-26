export type Locale = "en" | "fr";

const dictionaries = {
  en: {
    nav_search: "Search",
    nav_map_search: "Map Search",
    nav_open_houses: "Open houses",
    nav_areas: "Areas",
    nav_affordability: "Affordability",
    nav_precon: "Pre-construction",
    nav_valuation: "Home valuation",
    nav_home_worth: "What's my Home Worth?",
    nav_partners: "Partners",
    sign_in: "Sign in",
    my_account: "Your Houzzat",
    agent_desk: "Agent desk",
    admin: "Admin",
    hero_cta_search: "Search homes",
    ask_about_home: "Ask about this home",
    grounded_qa_title: "Ask the Expert",
    grounded_qa_hint:
      "Message a Houzzat agent on WhatsApp — we include this listing’s MLS® and address for you.",
    partners_title: "Referral partners",
    partners_subtitle:
      "Mortgage, legal, and inspection partners Houzzat agents can introduce you to — tracked handoffs, no surprise spam.",
  },
  fr: {
    nav_search: "Recherche",
    nav_map_search: "Recherche carte",
    nav_open_houses: "Portes ouvertes",
    nav_areas: "Quartiers",
    nav_affordability: "Capacité d'achat",
    nav_precon: "Préconstruction",
    nav_valuation: "Évaluation",
    nav_home_worth: "Quelle est la valeur de ma maison?",
    nav_partners: "Partenaires",
    sign_in: "Connexion",
    my_account: "Mon compte",
    agent_desk: "Espace courtier",
    admin: "Admin",
    hero_cta_search: "Chercher des maisons",
    ask_about_home: "Poser une question",
    grounded_qa_title: "Demandez à l’expert",
    grounded_qa_hint:
      "Écrivez à un courtier Houzzat sur WhatsApp — le MLS® et l’adresse sont inclus automatiquement.",
    partners_title: "Partenaires de référence",
    partners_subtitle:
      "Hypothèque, juridique et inspection — introductions suivies par les courtiers Houzzat.",
  },
} as const;

export type MessageKey = keyof (typeof dictionaries)["en"];

export function t(locale: Locale, key: MessageKey): string {
  return dictionaries[locale][key] ?? dictionaries.en[key];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "fr";
}
