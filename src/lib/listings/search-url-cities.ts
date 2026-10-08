/**
 * Decide which `cities` pipe (if any) syncUrl should write.
 * Incidental filter edits must not promote a lone `city=` into `cities=`,
 * which clears the search-bar display while keeping the API city.
 */
export function citiesParamForFilterSync(input: {
  explicitCities?: string;
  clearMultiPlace?: boolean;
  urlCitiesParam: string;
}): string {
  if (input.explicitCities !== undefined) return input.explicitCities;
  if (input.clearMultiPlace) return "";
  // Preserve an existing multi/structured cities URL; otherwise leave city on filters.city.
  return input.urlCitiesParam.trim();
}
