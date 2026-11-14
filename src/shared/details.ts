// The "My details" card. The plan: name, address, phone and email. Nothing else, and never a card number.
// Saved on this device only. It is on the plan's "never leaves the device" list.

/** Where the card is kept in the device's storage. */
export const DETAILS_KEY = 'guide:details';

export interface MyDetails {
  givenName?: string;
  familyName?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  /** Full name of the state, such as "Massachusetts". Short codes are worked out when a form wants one. */
  state?: string;
  postalCode?: string;
  country?: string;
}
