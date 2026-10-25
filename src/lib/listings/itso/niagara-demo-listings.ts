/**
 * Fictional Niagara packages shaped as RESO Property, Media, and OpenHouse.
 * Nothing here is copied from a live MLS row.
 */
import { demoPropertyImageUrl } from "@/lib/listings/itso/demo-property-image";
import type { ResoListingPackage, ResoPropertySubType } from "@/lib/listings/itso/reso-types";

const MARK = "DEMO PROPERTY";
const OFFICE = "Demo Property Brokerage";

type Seed = {
  n: number;
  city: string;
  streetNumber: string;
  streetName: string;
  streetSuffix: string;
  postalCode: string;
  price: number;
  beds: number;
  baths: number;
  parking: number;
  area: number;
  subtype: ResoPropertySubType;
  lat: number;
  lng: number;
  listed: string;
  accent: string;
  waterfront?: boolean;
  style: string;
  openHouse?: boolean;
};

const SEEDS: readonly Seed[] = [
  { n: 1001, city: "Niagara Falls", streetNumber: "4100", streetName: "Demo Ridge", streetSuffix: "Road", postalCode: "L2E 0D1", price: 899000, beds: 3, baths: 2, parking: 2, area: 1860, subtype: "Single Family Residence", lat: 43.094, lng: -79.091, listed: "2026-10-18", accent: "#29AD81", style: "Contemporary" },
  { n: 1002, city: "Niagara Falls", streetNumber: "22", streetName: "Demo Cascade", streetSuffix: "Lane", postalCode: "L2G 0D2", price: 649000, beds: 2, baths: 2, parking: 1, area: 1120, subtype: "Condominium", lat: 43.082, lng: -79.079, listed: "2026-10-09", accent: "#C8A66A", style: "High-Rise", waterfront: true },
  { n: 1003, city: "Niagara-on-the-Lake", streetNumber: "8", streetName: "Demo Orchard", streetSuffix: "Court", postalCode: "L0S 0D3", price: 2450000, beds: 5, baths: 4, parking: 3, area: 4280, subtype: "Single Family Residence", lat: 43.255, lng: -79.071, listed: "2026-10-14", accent: "#E7D7B1", style: "Estate", openHouse: true },
  { n: 1004, city: "Niagara-on-the-Lake", streetNumber: "150", streetName: "Demo Vine", streetSuffix: "Avenue", postalCode: "L0S 0D4", price: 1325000, beds: 4, baths: 3, parking: 2, area: 2680, subtype: "Single Family Residence", lat: 43.248, lng: -79.08, listed: "2026-09-28", accent: "#7DCEA0", style: "Traditional" },
  { n: 1005, city: "St. Catharines", streetNumber: "77", streetName: "Demo Lock", streetSuffix: "Street", postalCode: "L2R 0D5", price: 729000, beds: 3, baths: 3, parking: 2, area: 1640, subtype: "Townhouse", lat: 43.164, lng: -79.241, listed: "2026-10-11", accent: "#5DADE2", style: "Row" },
  { n: 1006, city: "St. Catharines", streetNumber: "310", streetName: "Demo Pier", streetSuffix: "Way", postalCode: "L2N 0D6", price: 589000, beds: 2, baths: 2, parking: 1, area: 1080, subtype: "Condominium", lat: 43.201, lng: -79.267, listed: "2026-09-19", accent: "#48C9B0", style: "Low-Rise", waterfront: true },
  { n: 1007, city: "Welland", streetNumber: "940", streetName: "Demo Canal", streetSuffix: "Drive", postalCode: "L3B 0D7", price: 674000, beds: 3, baths: 2, parking: 2, area: 1710, subtype: "Single Family Residence", lat: 42.992, lng: -79.248, listed: "2026-10-04", accent: "#F5B041", style: "Bungalow" },
  { n: 1008, city: "Welland", streetNumber: "16", streetName: "Demo Recreational", streetSuffix: "Crescent", postalCode: "L3C 0D8", price: 549000, beds: 3, baths: 2, parking: 1, area: 1420, subtype: "Townhouse", lat: 42.986, lng: -79.239, listed: "2026-09-30", accent: "#EB984E", style: "Row", openHouse: true },
  { n: 1009, city: "Thorold", streetNumber: "55", streetName: "Demo Escarpment", streetSuffix: "Place", postalCode: "L2V 0D9", price: 815000, beds: 4, baths: 3, parking: 2, area: 2210, subtype: "Single Family Residence", lat: 43.124, lng: -79.2, listed: "2026-10-07", accent: "#AF7AC5", style: "Two Storey" },
  { n: 1010, city: "Thorold", streetNumber: "400", streetName: "Demo Flightlock", streetSuffix: "Boulevard", postalCode: "L2V 1D0", price: 499000, beds: 2, baths: 2, parking: 1, area: 990, subtype: "Condominium", lat: 43.118, lng: -79.192, listed: "2026-09-16", accent: "#85929E", style: "Apartment" },
  { n: 1011, city: "Grimsby", streetNumber: "12", streetName: "Demo Shore", streetSuffix: "Lane", postalCode: "L3M 0D1", price: 1890000, beds: 4, baths: 4, parking: 3, area: 3460, subtype: "Single Family Residence", lat: 43.194, lng: -79.555, listed: "2026-10-16", accent: "#1ABC9C", style: "Waterfront", waterfront: true },
  { n: 1012, city: "Grimsby", streetNumber: "260", streetName: "Demo Bench", streetSuffix: "Road", postalCode: "L3M 0D2", price: 1675000, beds: 4, baths: 3, parking: 3, area: 3120, subtype: "Single Family Residence", lat: 43.188, lng: -79.568, listed: "2026-09-22", accent: "#117A65", style: "Estate" },
  { n: 1013, city: "Fort Erie", streetNumber: "700", streetName: "Demo Beach", streetSuffix: "Drive", postalCode: "L2A 0D3", price: 759000, beds: 3, baths: 2, parking: 2, area: 1780, subtype: "Single Family Residence", lat: 42.901, lng: -78.932, listed: "2026-10-01", accent: "#5D6D7E", style: "Cottage", waterfront: true },
  { n: 1014, city: "Fort Erie", streetNumber: "44", streetName: "Demo Garrison", streetSuffix: "Court", postalCode: "L2A 0D4", price: 529000, beds: 3, baths: 2, parking: 1, area: 1380, subtype: "Townhouse", lat: 42.909, lng: -78.945, listed: "2026-09-12", accent: "#B03A2E", style: "Townhouse" },
];

function packageFromSeed(seed: Seed): ResoListingPackage {
  const id = `ITSODEMO${seed.n}`;
  const key = `itso-demo-${seed.n}`;
  const address = `${seed.streetNumber} ${seed.streetName} ${seed.streetSuffix}`;
  const primary = demoPropertyImageUrl(seed.city, seed.accent);
  const secondary = demoPropertyImageUrl(`${seed.city} plan`, "#F6F1E8");
  const openHouses = seed.openHouse
    ? [
        {
          OpenHouseKey: `${key}-oh`,
          ListingKey: key,
          OpenHouseDate: "2026-10-25",
          OpenHouseStartTime: "2026-10-25T14:00:00.000Z",
          OpenHouseEndTime: "2026-10-25T16:00:00.000Z",
          OpenHouseType: "Public" as const,
          OpenHouseRemarks: `${MARK}. Public demonstration open house. Not a real showing.`,
        },
      ]
    : [];
  return {
    property: {
      ListingKey: key,
      ListingId: id,
      StandardStatus: "Active",
      ListPrice: seed.price,
      OriginalListPrice: seed.price,
      PropertyType: "Residential",
      PropertySubType: seed.subtype,
      StreetNumber: seed.streetNumber,
      StreetName: seed.streetName,
      StreetSuffix: seed.streetSuffix,
      City: seed.city,
      StateOrProvince: "ON",
      PostalCode: seed.postalCode,
      Country: "CA",
      UnparsedAddress: address,
      Latitude: seed.lat,
      Longitude: seed.lng,
      BedroomsTotal: seed.beds,
      BathroomsTotalInteger: seed.baths,
      BathroomsFull: seed.baths,
      ParkingTotal: seed.parking,
      LivingArea: seed.area,
      LivingAreaUnits: "Square Feet",
      PublicRemarks: `${MARK}. Fictional ${seed.style.toLowerCase()} home in ${seed.city} for interface testing. This record is not for sale and is not an MLS listing.`,
      YearBuilt: 2016,
      WaterfrontYN: seed.waterfront ?? false,
      ArchitecturalStyle: [seed.style],
      InteriorFeatures: ["Demo kitchen", "Demo principal bedroom"],
      ExteriorFeatures: seed.waterfront ? ["Demo waterfront frontage"] : ["Demo landscaped yard"],
      ListAgentFullName: "Riley Demo",
      ListOfficeName: OFFICE,
      ListingContractDate: `${seed.listed}T15:00:00.000Z`,
      ModificationTimestamp: "2026-10-20T15:00:00.000Z",
      OnMarketDate: `${seed.listed}T15:00:00.000Z`,
      PhotosCount: 2,
    },
    media: [
      {
        MediaKey: `${key}-1`,
        ResourceRecordKey: key,
        MediaURL: primary,
        MediaCategory: "Photo",
        Order: 0,
        PreferredPhotoYN: true,
        ShortDescription: MARK,
        MediaType: "image/svg+xml",
      },
      {
        MediaKey: `${key}-2`,
        ResourceRecordKey: key,
        MediaURL: secondary,
        MediaCategory: "Photo",
        Order: 1,
        ShortDescription: `${MARK} floor plan`,
        MediaType: "image/svg+xml",
      },
    ],
    openHouses,
  };
}

export const NIAGARA_DEMO_LISTINGS: readonly ResoListingPackage[] = SEEDS.map(packageFromSeed);

/** Closed record used to prove VOW fields stay off IDX output. Not served in search. */
export const NIAGARA_DEMO_CLOSED_LISTING: ResoListingPackage = {
  property: {
    ListingKey: "itso-demo-1901",
    ListingId: "ITSODEMO1901",
    StandardStatus: "Closed",
    ListPrice: 610000,
    ClosePrice: 595000,
    PropertyType: "Residential",
    PropertySubType: "Single Family Residence",
    StreetNumber: "1",
    StreetName: "Demo Archive",
    StreetSuffix: "Road",
    City: "Thorold",
    StateOrProvince: "ON",
    PostalCode: "L2V 9D9",
    Country: "CA",
    UnparsedAddress: "1 Demo Archive Road",
    Latitude: 43.13,
    Longitude: -79.21,
    BedroomsTotal: 3,
    BathroomsTotalInteger: 2,
    ParkingTotal: 1,
    LivingArea: 1500,
    LivingAreaUnits: "Square Feet",
    PublicRemarks: `${MARK}. Fictional closed record for VOW mapping tests. Not for sale.`,
    PrivateRemarks: "VOW ONLY demonstration note. Do not show on a public IDX page.",
    ListAgentFullName: "Riley Demo",
    ListOfficeName: OFFICE,
    ListingContractDate: "2026-08-01T15:00:00.000Z",
    ModificationTimestamp: "2026-09-02T15:00:00.000Z",
    PhotosCount: 1,
  },
  media: [
    {
      MediaKey: "itso-demo-1901-1",
      ResourceRecordKey: "itso-demo-1901",
      MediaURL: demoPropertyImageUrl("Closed demo", "#7F8C8D"),
      MediaCategory: "Photo",
      Order: 0,
      PreferredPhotoYN: true,
      ShortDescription: MARK,
      MediaType: "image/svg+xml",
    },
  ],
  openHouses: [],
};

export function niagaraDemoActiveListings(): ResoListingPackage[] {
  return NIAGARA_DEMO_LISTINGS.filter((record) => record.property.StandardStatus === "Active");
}

export function niagaraDemoByListingId(listingId: string): ResoListingPackage | null {
  const key = listingId.trim().toUpperCase();
  return (
    NIAGARA_DEMO_LISTINGS.find((record) => record.property.ListingId === key) ?? null
  );
}
