/**
 * RESO Data Dictionary fields used by the ITSO adapter.
 * Names match the public dictionary. ITSO-specific extensions stay absent
 * until an authenticated $metadata document confirms them.
 */

export type ResoStandardStatus = "Active" | "Pending" | "Closed";

/** RESO PropertySubType values used by these demo records. */
export type ResoPropertySubType =
  | "Single Family Residence"
  | "Townhouse"
  | "Condominium";

export type ResoProperty = {
  ListingKey: string;
  ListingId: string;
  StandardStatus: ResoStandardStatus;
  ListPrice: number;
  OriginalListPrice?: number;
  /** VOW. Never copied onto an IDX card or detail. */
  ClosePrice?: number;
  PropertyType: "Residential";
  PropertySubType: ResoPropertySubType;
  StreetNumber: string;
  StreetName: string;
  StreetSuffix?: string;
  UnitNumber?: string;
  City: string;
  StateOrProvince: "ON";
  PostalCode: string;
  Country: "CA";
  UnparsedAddress: string;
  Latitude: number;
  Longitude: number;
  BedroomsTotal: number;
  BathroomsTotalInteger: number;
  BathroomsFull?: number;
  BathroomsHalf?: number;
  ParkingTotal: number;
  LivingArea: number;
  LivingAreaUnits: "Square Feet";
  LotSizeArea?: number;
  LotSizeUnits?: "Acres" | "Square Feet";
  PublicRemarks: string;
  /** VOW. Never copied onto an IDX description. */
  PrivateRemarks?: string;
  YearBuilt?: number;
  WaterfrontYN?: boolean;
  ArchitecturalStyle?: string[];
  InteriorFeatures?: string[];
  ExteriorFeatures?: string[];
  ListAgentFullName: string;
  ListOfficeName: string;
  ListingContractDate: string;
  ModificationTimestamp: string;
  OnMarketDate?: string;
  PhotosCount: number;
};

export type ResoMedia = {
  MediaKey: string;
  ResourceRecordKey: string;
  MediaURL: string;
  MediaCategory: "Photo";
  Order: number;
  PreferredPhotoYN?: boolean;
  ShortDescription?: string;
  MediaType: "image/svg+xml" | "image/webp";
};

export type ResoOpenHouse = {
  OpenHouseKey: string;
  ListingKey: string;
  OpenHouseDate: string;
  OpenHouseStartTime: string;
  OpenHouseEndTime: string;
  OpenHouseType?: "Public";
  OpenHouseRemarks?: string;
};

export type ResoListingPackage = {
  property: ResoProperty;
  media: ResoMedia[];
  openHouses: ResoOpenHouse[];
};

export type ItsoDisplayAudience = "idx" | "vow";
