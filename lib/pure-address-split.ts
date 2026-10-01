// ── AN ADDRESS THE WAY A BANKING APP ASKS FOR IT ─────────────────────
//
// De eigenaar, 01-10: "maak dit handiger kopieerbaar: straat, country,
// postal code, city -- hoe banken meestal vragen". A banking app has a
// separate box for each of those; one copy button for four lines means
// pasting the whole block into the street field and deleting by hand.
//
// The bank sheet stores an address as lines: [name,] street, "City, X",
// country -- where X is a postal code ("Brussels, 1050", "London, EC2A
// 4JE") or a US state and ZIP ("Wilmington, DE 19801"). Anything that
// does not have that shape is returned as null and shown as it was.

export type AddressPart = { label: string; value: string };

export function splitAddress(value: string): AddressPart[] | null {
  const lines = String(value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 3) return null;

  const country = lines[lines.length - 1];
  const cityLine = lines[lines.length - 2];
  const before = lines.slice(0, -2);

  const m = /^(.+?),\s*(.+)$/.exec(cityLine);
  if (!m) return null;
  const city = m[1].trim();
  const rest = m[2].trim();

  const parts: AddressPart[] = [];
  // Two or more lines before the city: the first is a name ("Wise US
  // Inc"), the rest is the street.
  if (before.length >= 2) {
    parts.push({ label: "Name", value: before[0] });
    parts.push({ label: "Street", value: before.slice(1).join(", ") });
  } else if (before.length === 1) {
    parts.push({ label: "Street", value: before[0] });
  } else {
    return null;
  }

  parts.push({ label: "City", value: city });
  const us = /^([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(rest);
  if (us) {
    parts.push({ label: "State", value: us[1] });
    parts.push({ label: "ZIP code", value: us[2] });
  } else {
    parts.push({ label: "Postal code", value: rest });
  }
  parts.push({ label: "Country", value: country });
  return parts;
}
