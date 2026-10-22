/** Brokerage identity only. No board, IDX, or VOW claim. */
export function royalCollectionUnconnectedDisclosure(
  brokerageName: string | null,
): string {
  const brokerage = brokerageName?.trim();
  const identity = brokerage
    ? `${brokerage} is the brokerage for this website.`
    : "This website shows the brokerage configured for the workspace.";
  return `${identity} Listing-board attribution is omitted until an authorized listing source is connected.`;
}

/**
 * Temporary staging snapshot. The website brokerage is not the listing brokerage.
 * A stored image URL is not redistribution permission.
 */
export function royalCollectionSnapshotDisclosure(
  brokerageName: string | null,
): string {
  const brokerage = brokerageName?.trim();
  const site = brokerage
    ? `${brokerage} operates this website.`
    : "The configured brokerage operates this website.";
  return `${site} Records in the temporary staging snapshot keep the original listing brokerage and MLS attribution. They are not this brokerage's listings. A public image address is not permission to redistribute the photograph.`;
}
