export interface ProfileValidationInput {
  displayName: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  username: string;
}

export type ProfileValidationErrors = Record<string, string>;

function isHttpUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function validateProfile(input: ProfileValidationInput): ProfileValidationErrors {
  const errors: ProfileValidationErrors = {};

  if (!input.displayName.trim()) {
    errors.displayName = "Display name is required";
  }

  if (input.bio.length > 500) {
    errors.bio = `Bio must be 500 characters or less (${input.bio.length}/500)`;
  }

  if (input.avatarUrl && !isHttpUrl(input.avatarUrl)) {
    errors.avatarUrl = "Must be a valid URL starting with http:// or https://";
  }

  if (input.bannerUrl && !isHttpUrl(input.bannerUrl)) {
    errors.bannerUrl = "Must be a valid URL starting with http:// or https://";
  }

  if (input.username && !/^[a-z0-9_]+$/.test(input.username)) {
    errors.username = "Username may only contain lowercase letters, numbers, and underscores";
  }

  if (input.username && input.username.length > 30) {
    errors.username = "Username must be 30 characters or less";
  }

  return errors;
}
