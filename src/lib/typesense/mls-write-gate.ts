import {
  buildListingSourceAuthorityKey,
  type TypesenseListingDocument,
} from "@/lib/typesense/listing-document";

export type MlsTypesenseWriteDenyReason =
  | "missing_provenance"
  | "sak_mismatch";

export type MlsTypesenseWriteGate =
  | { allow: true }
  | { allow: false; reason: MlsTypesenseWriteDenyReason };

/**
 * MLS Typesense writes must carry exact org/provider + sourceAuthorityKey.
 * FSBO / manual / mock are not gated here — callers skip mocks before write.
 * Never invents TRREB/proptx defaults.
 */
export function gateMlsTypesenseDocument(input: {
  dataSource: string | null | undefined;
  organizationId?: string | null;
  providerKey?: string | null;
  document: TypesenseListingDocument;
}): MlsTypesenseWriteGate {
  if (input.dataSource !== "mls") {
    return { allow: true };
  }

  const expectedSak = buildListingSourceAuthorityKey(
    input.organizationId,
    input.providerKey,
  );
  if (!expectedSak) {
    return { allow: false, reason: "missing_provenance" };
  }

  const org = input.document.organizationId?.trim() ?? "";
  const provider = input.document.providerKey?.trim() ?? "";
  if (!org || !provider) {
    return { allow: false, reason: "missing_provenance" };
  }

  if (input.document.sourceAuthorityKey !== expectedSak) {
    return { allow: false, reason: "sak_mismatch" };
  }

  return { allow: true };
}
