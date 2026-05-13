import { describe, expect, it } from "vitest";
import { validateProfile } from "@/lib/settings/profile-validation";

describe("validateProfile", () => {
  it("returns no errors for valid profile input", () => {
    const errors = validateProfile({
      displayName: "Jane",
      bio: "Artist",
      avatarUrl: "https://example.com/avatar.jpg",
      bannerUrl: "http://example.com/banner.jpg",
      username: "jane_123",
    });

    expect(errors).toEqual({});
  });

  it("validates required display name", () => {
    const errors = validateProfile({
      displayName: "   ",
      bio: "",
      avatarUrl: "",
      bannerUrl: "",
      username: "",
    });

    expect(errors.displayName).toBe("Display name is required");
  });

  it("validates bio length", () => {
    const errors = validateProfile({
      displayName: "Jane",
      bio: "a".repeat(501),
      avatarUrl: "",
      bannerUrl: "",
      username: "",
    });

    expect(errors.bio).toBe("Bio must be 500 characters or less (501/500)");
  });

  it("validates avatar and banner URLs", () => {
    const errors = validateProfile({
      displayName: "Jane",
      bio: "",
      avatarUrl: "ftp://bad-url",
      bannerUrl: "example.com/banner.jpg",
      username: "",
    });

    expect(errors.avatarUrl).toBe("Must be a valid URL starting with http:// or https://");
    expect(errors.bannerUrl).toBe("Must be a valid URL starting with http:// or https://");
  });

  it("validates username format", () => {
    const errors = validateProfile({
      displayName: "Jane",
      bio: "",
      avatarUrl: "",
      bannerUrl: "",
      username: "Jane-User",
    });

    expect(errors.username).toBe("Username may only contain lowercase letters, numbers, and underscores");
  });

  it("validates username max length", () => {
    const errors = validateProfile({
      displayName: "Jane",
      bio: "",
      avatarUrl: "",
      bannerUrl: "",
      username: "a".repeat(31),
    });

    expect(errors.username).toBe("Username must be 30 characters or less");
  });
});
