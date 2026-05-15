export const PUSH_PREFERENCES_SELECT = {
  pushGenerationComplete: true,
  pushNewFollower: true,
  pushSongComment: true,
} as const;

export type PushPreferences = {
  pushGenerationComplete: boolean;
  pushNewFollower: boolean;
  pushSongComment: boolean;
};

export function toPushPreferencesResponse(user: PushPreferences): PushPreferences {
  return {
    pushGenerationComplete: user.pushGenerationComplete,
    pushNewFollower: user.pushNewFollower,
    pushSongComment: user.pushSongComment,
  };
}
