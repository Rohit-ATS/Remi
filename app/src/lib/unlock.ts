// What this device calls the gesture that unlocks a passkey.
//
// Nothing here changes what the app does. A passkey ceremony asks the platform
// for user verification and the platform decides how to collect it — a face, a
// fingerprint, a PIN — so Touch ID and Windows Hello have always worked exactly
// as well as Face ID does. What did not work was the copy: every button said
// "Face ID", which on a laptop with a fingerprint reader reads as a list of
// hardware this product needs and the reader is not on it.
//
// The name is a guess from the platform, so it is only ever used as a label. If
// the guess is wrong the ceremony is unaffected; the button just says something
// a little generic.

/**
 * The local unlock gesture, phrased to follow "with": "Set up with Touch ID",
 * "Confirm with Windows Hello", "Continue with your fingerprint".
 *
 * Falls back to naming the passkey itself, which is true everywhere and wrong
 * nowhere.
 */
export function unlockName(): string {
  if (typeof navigator === "undefined") return "your passkey";

  // `userAgentData` is the modern, unspoofed answer where it exists, and is
  // still missing from Safari and Firefox — which is where `platform` and the
  // user-agent string carry it instead.
  const hinted = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const subject = `${hinted?.platform ?? navigator.platform ?? ""} ${navigator.userAgent}`;

  // iPadOS reports itself as a Mac and is told apart by having a touchscreen,
  // which no Mac has.
  const touch = navigator.maxTouchPoints > 1;

  if (/iPhone|iPod/i.test(subject)) return "Face ID";
  if (/iPad/i.test(subject)) return "Face ID or Touch ID";
  if (/Mac/i.test(subject)) return touch ? "Face ID or Touch ID" : "Touch ID";
  if (/Android/i.test(subject)) return "your fingerprint";
  if (/Win/i.test(subject)) return "Windows Hello";
  return "your passkey";
}
