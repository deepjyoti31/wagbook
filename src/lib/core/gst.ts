/**
 * India GST helpers: state codes and GSTIN validation.
 *
 * Nothing here is tax advice. It encodes the mechanical parts (format,
 * checksum, which state a GSTIN belongs to). What rate applies to a service,
 * which SAC code to print and whether a kennel must register are questions
 * for the kennel's chartered accountant. See docs/06-billing-and-gst.md.
 */

/** GST state and union territory codes, as used in the first two GSTIN digits. */
export const GST_STATES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
};

export function isGstStateCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(GST_STATES, code);
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** The 15th character of a GSTIN, computed from the first 14. */
export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const value = GSTIN_CHARS.indexOf(first14[i]);
    if (value < 0) throw new RangeError("GSTIN may only contain digits and capital letters");
    const product = value * (i % 2 === 0 ? 1 : 2);
    total += Math.trunc(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (total % 36)) % 36];
}

/** True when the GSTIN has the right shape, a known state code and a valid check character. */
export function isValidGstin(input: string): boolean {
  const gstin = input.trim().toUpperCase();
  if (!GSTIN_SHAPE.test(gstin)) return false;
  if (!isGstStateCode(gstin.slice(0, 2))) return false;
  return gstinCheckChar(gstin.slice(0, 14)) === gstin[14];
}

/** The state code a GSTIN was issued in, or null if the GSTIN is not valid. */
export function gstinStateCode(input: string): string | null {
  return isValidGstin(input) ? input.trim().slice(0, 2) : null;
}
