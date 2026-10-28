import { homesForSalePath } from "@/lib/geo/area-paths";

/**
 * Public community guides for the HIGH OCTANE workspace.
 * History and attractions are widely known civic facts.
 * Listing inventory is loaded separately and is never invented here.
 */
export type HighOctaneCommunityGuide = {
  name: string;
  city: string;
  slug: string;
  imageUrl: string | null;
  summary: string;
  overview: string;
  history: string;
  attractions: readonly string[];
  highlights: readonly string[];
  searchHref: string;
};

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const GUIDES = [
  {
    name: "Niagara Falls",
    city: "Niagara Falls",
    imageUrl: "/media/royal-collection/high-octane/niagara-falls-community.webp",
    summary: "The cataracts, the gorge, and the neighbourhoods beside them.",
    overview:
      "Niagara Falls is the city that takes its name from the river. The Canadian Horseshoe Falls, the gorge, and the parkland along the river shape how people live and visit here.",
    history:
      "Through the 19th century the riverbank became a destination for travellers, and the surrounding townships grew around tourism, railways, and hydroelectric power. The former township of Stamford and the city of Niagara Falls later formed the municipality visitors know today. The falls remain the centre of the city's identity.",
    attractions: [
      "Horseshoe Falls and Table Rock",
      "Niagara Parks, including Queen Victoria Park and the Floral Clock",
      "Journey Behind the Falls and the Niagara Whirlpool",
      "Clifton Hill",
      "The Niagara Parks Power Station and the gorge parks",
    ],
    highlights: [
      "Parkland that puts the falls within a walk of the city",
      "Neighbourhoods that range from the gorge to quieter residential streets",
      "A year-round visitor economy along the river",
      "Direct connections on the Queen Elizabeth Way and the Niagara Parkway",
    ],
  },
  {
    name: "Niagara-on-the-Lake",
    city: "Niagara-on-the-Lake",
    imageUrl: "/media/royal-collection/high-octane/notl-hotel.webp",
    summary: "A historic town of heritage streets, vineyards, and the lake.",
    overview:
      "Niagara-on-the-Lake sits where the Niagara River meets Lake Ontario. Old Town, the surrounding villages, and the vineyard bench give it a character unlike the larger cities nearby.",
    history:
      "The settlement was founded as Newark and served briefly as the first capital of Upper Canada in the 1790s. Fort George, the old street grid, and the farms around the town remained as the community became known for heritage buildings, theatre, and wine.",
    attractions: [
      "Queen Street heritage district",
      "Fort George",
      "The Shaw Festival",
      "Estate wineries on the Niagara-on-the-Lake bench",
      "Queen's Royal Park, where the river meets the lake",
    ],
    highlights: [
      "One of Ontario's most intact historic towns",
      "Villages that include Old Town, St. Davids, Virgil, and Queenston",
      "Vineyards between the lake and the escarpment",
      "A market known for heritage houses and estate properties",
    ],
  },
  {
    name: "St. Catharines",
    city: "St. Catharines",
    imageUrl: "/media/royal-collection/high-octane/port-dalhousie-lighthouse.webp",
    summary: "Niagara's largest city, from the canal to Port Dalhousie.",
    overview:
      "St. Catharines is the urban centre of Niagara Region. The Welland Canal, Twelve Mile Creek, downtown, and the lakeside village of Port Dalhousie each give the city a different face.",
    history:
      "The city grew first as a mill town on Twelve Mile Creek and later as a canal city. The Welland Canal still runs through it. Port Dalhousie, Merritton, and the downtown core each keep a different chapter of that history. Brock University sits on the escarpment side of the city.",
    attractions: [
      "Port Dalhousie beach, pier, and lighthouse",
      "Welland Canal locks and viewing areas",
      "Downtown St. Catharines and the performing arts centre",
      "Montebello Park",
      "Brock University and the Glenridge neighbourhood",
    ],
    highlights: [
      "The largest city in Niagara Region",
      "Lakeside streets at Port Dalhousie",
      "Canal trails through the older neighbourhoods",
      "A wide mix of downtown, suburban, and waterfront housing",
    ],
  },
  {
    name: "Welland",
    city: "Welland",
    imageUrl: null,
    summary: "The Rose City, built along the Welland Canal.",
    overview:
      "Welland is the city the canal runs through. Ships climbing between Lake Ontario and Lake Erie pass the downtown, and the recreational canal has become a park through the centre of the city.",
    history:
      "Welland took shape around the Welland Canal, the waterway built so ships could climb the Niagara Escarpment. The city is known as the Rose City. The canal, the downtown bridges, and the island parks are still the landmarks people use to describe it.",
    attractions: [
      "The Welland Canal and the downtown bridge",
      "Welland Canal Trail",
      "Merritt Island",
      "Welland Civic Centre and the rose gardens",
    ],
    highlights: [
      "A canal park running through the city",
      "Older neighbourhoods beside newer subdivisions",
      "Straight connections to Thorold, Port Colborne, and the highway",
      "A practical city between the canal and the escarpment towns",
    ],
  },
  {
    name: "Thorold",
    city: "Thorold",
    imageUrl: null,
    summary: "A canal city on the rise of the Niagara Escarpment.",
    overview:
      "Thorold is where the Welland Canal climbs the escarpment. The locks, the older downtown, and the streets above the canal make it a smaller city with a very particular setting.",
    history:
      "Thorold grew with the canal works and the mills that used the drop of the escarpment. Lock 7, where ships rise in front of a public viewing platform, is the image most people carry of the city. The Battle of Beaverdams, fought nearby during the War of 1812, is part of the same landscape.",
    attractions: [
      "Lock 7 viewing centre",
      "Battle of Beaverdams Park",
      "The Welland Canal trail through the city",
      "The downtown streets above the locks",
    ],
    highlights: [
      "The escarpment and the canal in one place",
      "A smaller downtown close to St. Catharines",
      "Neighbourhoods tucked against the locks and the hill",
      "Easy reach of Brock University and the regional highway",
    ],
  },
  {
    name: "Grimsby",
    city: "Grimsby",
    imageUrl: "/media/royal-collection/high-octane/notl-house.webp",
    summary: "Lake, beach, and escarpment at Niagara's western door.",
    overview:
      "Grimsby stands between Lake Ontario and the Niagara Escarpment, at the western entrance to the region. Fruit land, the beach, and the bench above town still define it.",
    history:
      "The community began as a lakeshore settlement on Forty Mile Creek and became known for fruit growing on the land between the lake and the escarpment. Grimsby Beach, with its historic cottage streets, and the farms on the bench are both part of that story.",
    attractions: [
      "Beamer Memorial Conservation Area and the escarpment lookout",
      "Grimsby Beach",
      "Forty Mile Creek",
      "The bench wineries toward Beamsville",
    ],
    highlights: [
      "The escarpment and the lake inside one town",
      "The gateway between Hamilton and the rest of Niagara",
      "Historic cottage streets near the beach",
      "Orchards, vineyards, and neighbourhoods on the bench",
    ],
  },
  {
    name: "Fort Erie",
    city: "Fort Erie",
    imageUrl: null,
    summary: "Where the Niagara River opens onto Lake Erie.",
    overview:
      "Fort Erie is the southern end of the Niagara River. The old fort, the Peace Bridge, and the Lake Erie beaches at Crystal Beach give the town its outline.",
    history:
      "Old Fort Erie guarded the entrance from Lake Erie. The Peace Bridge later tied the town to Buffalo, and Crystal Beach grew into one of the best-known shorelines on the Canadian side of the lake. The amusement park is gone; the beach and the fort remain.",
    attractions: [
      "Old Fort Erie",
      "Crystal Beach and Bay Beach",
      "The Peace Bridge and the riverfront",
      "Fort Erie Race Track",
    ],
    highlights: [
      "The southern gateway of the Niagara River",
      "Sandy beaches on Lake Erie",
      "The historic fort and the streets around it",
      "A quieter town than the falls or Old Town",
    ],
  },
  {
    name: "Lincoln",
    city: "Lincoln",
    imageUrl: null,
    summary: "Beamsville, Jordan, and Vineland on the wine bench.",
    overview:
      "Lincoln is a town of villages. Beamsville, Jordan, and Vineland sit between Lake Ontario and the escarpment, on one of Niagara's defining wine benches.",
    history:
      "The town brings together communities that grew as fruit and vineyard country. Ball's Falls, where Twenty Mile Creek drops over the escarpment, marks the geography that made the bench: a sheltered slope between the hill and the lake.",
    attractions: [
      "Ball's Falls Conservation Area",
      "The Beamsville Bench wineries",
      "Jordan Village",
      "Vineland and Jordan Harbour",
    ],
    highlights: [
      "Villages rather than a single downtown",
      "The Beamsville Bench and its vineyards",
      "Escarpment trails above the orchards",
      "A mix of village streets and rural properties",
    ],
  },
  {
    name: "Fonthill / Pelham",
    city: "Pelham",
    imageUrl: null,
    summary: "Fonthill and the villages of Pelham, set on the kame.",
    overview:
      "Pelham is the town; Fonthill is its main centre. It sits on the Fonthill Kame, a glacial hill between the canal cities and the escarpment.",
    history:
      "Pelham remained a town of villages while the canal cities around it grew. Fonthill, Fenwick, Ridgeville, and Effingham each keep a small centre. The Short Hills and the Comfort Maple, a sugar maple of exceptional age in a local park, are the landmarks residents point to.",
    attractions: [
      "Short Hills Provincial Park",
      "The Comfort Maple",
      "Downtown Fonthill",
      "Fenwick, Ridgeville, and the Pelham trails",
    ],
    highlights: [
      "A town of villages rather than one urban core",
      "Elevated land between St. Catharines and Welland",
      "Quiet residential streets and older village centres",
      "Short Hills and the escarpment within a short drive",
    ],
  },
] as const;

export const HIGH_OCTANE_COMMUNITY_GUIDES: readonly HighOctaneCommunityGuide[] = GUIDES.map(
  (guide) => ({
    ...guide,
    slug: slugify(guide.name),
    searchHref: homesForSalePath({ city: guide.city }),
  }),
);

export function highOctaneCommunityGuideBySlug(
  slug: string,
): HighOctaneCommunityGuide | null {
  return HIGH_OCTANE_COMMUNITY_GUIDES.find((guide) => guide.slug === slug) ?? null;
}
