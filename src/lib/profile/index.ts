export type { ProfileResult } from "./result";
export type { ProfileUpdateInput, DeleteAccountInput } from "./profile";
export type { PreferencesUpdateInput } from "./preferences";

export { getProfile, updateProfile, deleteAccount } from "./profile";
export { getPreferences, updatePreferences, VALID_STYLES } from "./preferences";
