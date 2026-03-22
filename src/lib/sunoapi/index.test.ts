import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateSong,
  getTaskStatus,
  listSongs,
  getSongById,
  downloadSong,
  extendMusic,
  uploadAndCover,
  uploadAndExtend,
  addVocals,
  addInstrumental,
  generateMashup,
  replaceSection,
  generateLyrics,
  getTimestampedLyrics,
  separateVocals,
  convertToWav,
  generateMidi,
  createMusicVideo,
  generatePersona,
  boostStyle,
  getRemainingCredits,
  uploadFileBase64,
  uploadFileFromUrl,
  SunoApiError,
  sunoApi,
} from "./index";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_SONG = {
  id: "song-123",
  title: "Test Song",
  prompt: "A happy tune",
  tags: "pop",
  audioUrl: "https://cdn.sunoapi.org/audio/song-123.mp3",
  imageUrl: "https://cdn.sunoapi.org/images/song-123.jpg",
  duration: 120,
  status: "complete" as const,
  model: "chirp-v3",
  createdAt: "2026-03-19T00:00:00.000Z",
};

const MOCK_TASK_RESPONSE = {
  code: 200,
  msg: "success",
  data: { taskId: "task-abc123" },
};

const MOCK_TASK_STATUS_SUCCESS = {
  code: 200,
  msg: "success",
  data: {
    taskId: "task-abc123",
    status: "SUCCESS",
    errorMessage: null,
    operationType: "generate",
    response: {
      sunoData: [
        {
          id: "audio-1",
          title: "Generated Song",
          prompt: "upbeat pop",
          tags: "pop",
          audio_url: "https://cdn.sunoapi.org/audio/audio-1.mp3",
          stream_audio_url: "https://cdn.sunoapi.org/stream/audio-1.mp3",
          image_url: "https://cdn.sunoapi.org/images/audio-1.jpg",
          duration: 180,
          model_name: "V4",
          createTime: "2026-03-19T00:00:00.000Z",
        },
      ],
    },
  },
};

// ─── fetch mock helpers ───────────────────────────────────────────────────────

function mockFetchOnce(body: unknown, status = 200): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

function mockFetchError(status: number, message = "Server error"): void {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ msg: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  process.env.SUNOAPI_KEY = "test-api-key";
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUNOAPI_KEY;
});

// ─── generateSong ─────────────────────────────────────────────────────────────

describe("generateSong", () => {
  it("returns taskId on success", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);

    const result = await generateSong("A happy tune", { style: "pop" });

    expect(result.taskId).toBe("task-abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("sends required fields: instrumental, customMode, model, callBackUrl", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("test", { title: "My Song", style: "rock" });

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.instrumental).toBe(false);
    expect(body.customMode).toBe(true);
    expect(body.model).toBe("V4");
    expect(body.callBackUrl).toBeDefined();
    expect(body.title).toBe("My Song");
    expect(body.style).toBe("rock");
  });

  it("sets customMode=false when no title or style", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("upbeat electronic");

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.customMode).toBe(false);
  });

  it("sends Authorization header with API key", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("test");

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect((callInit.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-api-key"
    );
  });

  it("throws SunoApiError(0) if SUNOAPI_KEY is not set", async () => {
    delete process.env.SUNOAPI_KEY;
    await expect(generateSong("test")).rejects.toThrow(SunoApiError);
    await expect(generateSong("test")).rejects.toMatchObject({ status: 0 });
  });

  it("throws SunoApiError for non-retryable 4xx errors", async () => {
    mockFetchError(400, "Bad request");
    const err = await generateSong("test").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 400, message: "Bad request" });
  });

  it("throws when response has no taskId", async () => {
    mockFetchOnce({ code: 200, msg: "success", data: {} });
    await expect(generateSong("test")).rejects.toThrow("No taskId returned");
  });

  it("sends style tuning options when provided", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateSong("test", {
      style: "pop",
      title: "My Song",
      model: "V4_5",
      negativeTags: "metal",
      vocalGender: "f",
      styleWeight: 0.8,
      weirdnessConstraint: 0.3,
      audioWeight: 0.5,
      personaId: "persona-1",
      personaModel: "voice_persona",
    });

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.model).toBe("V4_5");
    expect(body.negativeTags).toBe("metal");
    expect(body.vocalGender).toBe("f");
    expect(body.styleWeight).toBe(0.8);
    expect(body.weirdnessConstraint).toBe(0.3);
    expect(body.audioWeight).toBe(0.5);
    expect(body.personaId).toBe("persona-1");
    expect(body.personaModel).toBe("voice_persona");
  });
});

// ─── getTaskStatus ────────────────────────────────────────────────────────────

describe("getTaskStatus", () => {
  it("returns status and songs on success", async () => {
    mockFetchOnce(MOCK_TASK_STATUS_SUCCESS);

    const result = await getTaskStatus("task-abc123");

    expect(result.status).toBe("SUCCESS");
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].audioUrl).toBe("https://cdn.sunoapi.org/audio/audio-1.mp3");
    expect(result.songs[0].streamAudioUrl).toBe("https://cdn.sunoapi.org/stream/audio-1.mp3");
    expect(result.songs[0].status).toBe("complete");
    expect(result.operationType).toBe("generate");
  });

  it("returns pending status when task is still processing", async () => {
    mockFetchOnce({
      code: 200,
      msg: "success",
      data: { taskId: "task-abc123", status: "PENDING", response: {} },
    });

    const result = await getTaskStatus("task-abc123");
    expect(result.status).toBe("PENDING");
    expect(result.songs).toHaveLength(0);
  });

  it("returns error status for failed tasks", async () => {
    mockFetchOnce({
      code: 200,
      msg: "success",
      data: {
        taskId: "task-abc123",
        status: "GENERATE_AUDIO_FAILED",
        errorMessage: "Content policy violation",
        response: {},
      },
    });

    const result = await getTaskStatus("task-abc123");
    expect(result.status).toBe("GENERATE_AUDIO_FAILED");
    expect(result.errorMessage).toBe("Content policy violation");
  });

  it("maps snake_case fields from API response", async () => {
    mockFetchOnce(MOCK_TASK_STATUS_SUCCESS);
    const result = await getTaskStatus("task-abc123");
    const song = result.songs[0];
    expect(song.audioUrl).toBe("https://cdn.sunoapi.org/audio/audio-1.mp3");
    expect(song.imageUrl).toBe("https://cdn.sunoapi.org/images/audio-1.jpg");
    expect(song.model).toBe("V4");
  });
});

// ─── listSongs ────────────────────────────────────────────────────────────────

describe("listSongs", () => {
  it("returns array of songs on success", async () => {
    mockFetchOnce({ clips: [MOCK_SONG] });

    const result = await listSongs();
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Test Song");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/songs",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns empty array for empty response", async () => {
    mockFetchOnce({ clips: [] });
    const result = await listSongs();
    expect(result).toEqual([]);
  });
});

// ─── getSongById ──────────────────────────────────────────────────────────────

describe("getSongById", () => {
  it("returns a song on success (clip key)", async () => {
    mockFetchOnce({ clip: MOCK_SONG });

    const result = await getSongById("song-123");
    expect(result.id).toBe("song-123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/songs/song-123",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns a song on success (data key)", async () => {
    mockFetchOnce({ data: MOCK_SONG });
    const result = await getSongById("song-123");
    expect(result.id).toBe("song-123");
  });

  it("throws SunoApiError(404) when song missing from response body", async () => {
    mockFetchOnce({});
    const err = await getSongById("song-123").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 404 });
  });

  it("URL-encodes the song ID", async () => {
    mockFetchOnce({ clip: MOCK_SONG });
    await getSongById("song/with/slashes");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/songs/song%2Fwith%2Fslashes",
      expect.any(Object)
    );
  });
});

// ─── downloadSong ─────────────────────────────────────────────────────────────

describe("downloadSong", () => {
  it("fetches the audioUrl and returns ArrayBuffer", async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33]).buffer;

    // First call: getSongById
    mockFetchOnce({ clip: MOCK_SONG });
    // Second call: download the audio
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(audioBytes, {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    );

    const result = await downloadSong("song-123");
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      MOCK_SONG.audioUrl,
      expect.objectContaining({ method: "GET" })
    );
  });
});

// ─── extendMusic ──────────────────────────────────────────────────────────────

describe("extendMusic", () => {
  it("sends correct params for default extension", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await extendMusic({ audioId: "audio-1" });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.audioId).toBe("audio-1");
    expect(body.defaultParamFlag).toBe(false);
    expect(body.model).toBe("V4");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/extend",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("sends custom params when defaultParamFlag=true", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await extendMusic({
      audioId: "audio-1",
      defaultParamFlag: true,
      prompt: "more vocals",
      style: "rock",
      title: "Extended Track",
      continueAt: 120,
      model: "V4_5",
    });

    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.defaultParamFlag).toBe(true);
    expect(body.prompt).toBe("more vocals");
    expect(body.style).toBe("rock");
    expect(body.title).toBe("Extended Track");
    expect(body.continueAt).toBe(120);
    expect(body.model).toBe("V4_5");
  });
});

// ─── uploadAndCover ───────────────────────────────────────────────────────────

describe("uploadAndCover", () => {
  it("sends upload URL and cover options", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await uploadAndCover({
      uploadUrl: "https://example.com/audio.mp3",
      customMode: true,
      style: "jazz",
      title: "Jazz Cover",
      prompt: "smooth jazz version",
    });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.uploadUrl).toBe("https://example.com/audio.mp3");
    expect(body.customMode).toBe(true);
    expect(body.style).toBe("jazz");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/upload-cover",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── uploadAndExtend ──────────────────────────────────────────────────────────

describe("uploadAndExtend", () => {
  it("sends upload URL and extend options", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await uploadAndExtend({
      uploadUrl: "https://example.com/audio.mp3",
      model: "V5",
    });

    expect(result.taskId).toBe("task-abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/upload-extend",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── addVocals ────────────────────────────────────────────────────────────────

describe("addVocals", () => {
  it("sends required vocal params", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await addVocals({
      uploadUrl: "https://example.com/instrumental.mp3",
      prompt: "soulful singing",
      title: "Vocal Track",
      style: "R&B",
    });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.uploadUrl).toBe("https://example.com/instrumental.mp3");
    expect(body.prompt).toBe("soulful singing");
    expect(body.style).toBe("R&B");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/add-vocals",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── addInstrumental ──────────────────────────────────────────────────────────

describe("addInstrumental", () => {
  it("sends required instrumental params", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await addInstrumental({
      uploadUrl: "https://example.com/vocals.mp3",
      title: "Backing Track",
      tags: "Piano, Ambient",
    });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.tags).toBe("Piano, Ambient");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/add-instrumental",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── generateMashup ───────────────────────────────────────────────────────────

describe("generateMashup", () => {
  it("sends two audio URLs", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await generateMashup({
      uploadUrlList: ["https://example.com/a.mp3", "https://example.com/b.mp3"],
      prompt: "blend these tracks",
    });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.uploadUrlList).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/mashup",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── replaceSection ───────────────────────────────────────────────────────────

describe("replaceSection", () => {
  it("sends section replacement params", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await replaceSection({
      taskId: "task-1",
      audioId: "audio-1",
      prompt: "guitar solo",
      tags: "rock, electric guitar",
      title: "Rock Section",
      infillStartS: 30.0,
      infillEndS: 60.0,
    });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.infillStartS).toBe(30.0);
    expect(body.infillEndS).toBe(60.0);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/replace-section",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── generateLyrics ───────────────────────────────────────────────────────────

describe("generateLyrics", () => {
  it("returns taskId on success", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await generateLyrics({ prompt: "a love song about the ocean" });

    expect(result.taskId).toBe("task-abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/lyrics",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── getTimestampedLyrics ─────────────────────────────────────────────────────

describe("getTimestampedLyrics", () => {
  it("returns timestamped word data", async () => {
    const mockLyrics = {
      code: 200,
      msg: "success",
      data: {
        alignedWords: [
          { word: "Hello", success: true, startS: 0.5, endS: 1.0, palign: 1 },
          { word: "world", success: true, startS: 1.1, endS: 1.5, palign: 1 },
        ],
        waveformData: [0.1, 0.5, 0.3],
        hootCer: 0.95,
        isStreamed: false,
      },
    };
    mockFetchOnce(mockLyrics);

    const result = await getTimestampedLyrics("task-1", "audio-1");

    expect(result.alignedWords).toHaveLength(2);
    expect(result.alignedWords[0].word).toBe("Hello");
    expect(result.alignedWords[0].startS).toBe(0.5);
    expect(result.hootCer).toBe(0.95);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/get-timestamped-lyrics",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── separateVocals ───────────────────────────────────────────────────────────

describe("separateVocals", () => {
  it("sends separation request", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await separateVocals({
      taskId: "task-1",
      audioId: "audio-1",
      type: "separate_vocal",
    });

    expect(result.taskId).toBe("task-abc123");
    const callInit = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(callInit.body as string);
    expect(body.type).toBe("separate_vocal");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/vocal-removal/generate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("supports split_stem type", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await separateVocals({ taskId: "t", audioId: "a", type: "split_stem" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.type).toBe("split_stem");
  });
});

// ─── convertToWav ─────────────────────────────────────────────────────────────

describe("convertToWav", () => {
  it("sends WAV conversion request", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await convertToWav({ taskId: "task-1", audioId: "audio-1" });

    expect(result.taskId).toBe("task-abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/wav/generate",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── generateMidi ─────────────────────────────────────────────────────────────

describe("generateMidi", () => {
  it("sends MIDI generation request", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await generateMidi({ taskId: "task-1", audioId: "audio-1" });

    expect(result.taskId).toBe("task-abc123");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/midi/generate",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("works without optional audioId", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    await generateMidi({ taskId: "task-1" });
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.audioId).toBeUndefined();
  });
});

// ─── createMusicVideo ─────────────────────────────────────────────────────────

describe("createMusicVideo", () => {
  it("sends music video request with optional fields", async () => {
    mockFetchOnce(MOCK_TASK_RESPONSE);
    const result = await createMusicVideo({
      taskId: "task-1",
      audioId: "audio-1",
      author: "SunoFlow",
      domainName: "sunoflow.com",
    });

    expect(result.taskId).toBe("task-abc123");
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(body.author).toBe("SunoFlow");
    expect(body.domainName).toBe("sunoflow.com");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/mp4/generate",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── generatePersona ──────────────────────────────────────────────────────────

describe("generatePersona", () => {
  it("returns persona result", async () => {
    mockFetchOnce({
      code: 200,
      msg: "success",
      data: { personaId: "p-1", name: "Jazz Voice", description: "Smooth" },
    });

    const result = await generatePersona({
      taskId: "task-1",
      audioId: "audio-1",
      name: "Jazz Voice",
      description: "Smooth jazz vocal style",
      vocalStart: 5,
      vocalEnd: 25,
    });

    expect(result.personaId).toBe("p-1");
    expect(result.name).toBe("Jazz Voice");
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/generate-persona",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── boostStyle ───────────────────────────────────────────────────────────────

describe("boostStyle", () => {
  it("returns expanded style result", async () => {
    mockFetchOnce({
      code: 200,
      msg: "success",
      data: {
        taskId: "t-1",
        param: "Pop, Mysterious",
        result: "Pop with dark mysterious undertones, minor key...",
        creditsConsumed: 1,
        creditsRemaining: 99,
      },
    });

    const result = await boostStyle("Pop, Mysterious");

    expect(result.result).toContain("mysterious");
    expect(result.creditsRemaining).toBe(99);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/style/generate",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── getRemainingCredits ──────────────────────────────────────────────────────

describe("getRemainingCredits", () => {
  it("returns credit count", async () => {
    mockFetchOnce({ code: 200, msg: "success", data: 500 });
    const credits = await getRemainingCredits();
    expect(credits).toBe(500);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.sunoapi.org/api/v1/generate/credit",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("returns zero credits", async () => {
    mockFetchOnce({ code: 200, msg: "success", data: 0 });
    const credits = await getRemainingCredits();
    expect(credits).toBe(0);
  });
});

// ─── File Uploads ─────────────────────────────────────────────────────────────

describe("uploadFileBase64", () => {
  it("returns file upload result", async () => {
    mockFetchOnce({
      success: true,
      code: 200,
      data: {
        fileId: "file-1",
        fileUrl: "https://sunoapiorg.redpandaai.co/files/file-1",
        downloadUrl: "https://sunoapiorg.redpandaai.co/download/file-1",
        expiresAt: "2026-03-25T00:00:00Z",
      },
    });

    const result = await uploadFileBase64("SGVsbG8gV29ybGQ=");
    expect(result.fileId).toBe("file-1");
    expect(result.fileUrl).toContain("redpandaai.co");
    expect(fetch).toHaveBeenCalledWith(
      "https://sunoapiorg.redpandaai.co/api/file-base64-upload",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("uploadFileFromUrl", () => {
  it("returns file upload result", async () => {
    mockFetchOnce({
      success: true,
      code: 200,
      data: {
        fileId: "file-2",
        fileUrl: "https://sunoapiorg.redpandaai.co/files/file-2",
        downloadUrl: "https://sunoapiorg.redpandaai.co/download/file-2",
        expiresAt: "2026-03-25T00:00:00Z",
      },
    });

    const result = await uploadFileFromUrl("https://example.com/audio.mp3");
    expect(result.fileId).toBe("file-2");
    expect(fetch).toHaveBeenCalledWith(
      "https://sunoapiorg.redpandaai.co/api/file-url-upload",
      expect.objectContaining({ method: "POST" })
    );
  });
});

// ─── 429 retry logic ──────────────────────────────────────────────────────────

describe("retry on 429", () => {
  it("retries up to 3 times on 429 and succeeds", async () => {
    vi.useFakeTimers();

    // First 3 calls: 429, then success
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchOnce({ clips: [MOCK_SONG] });

    const promise = listSongs();

    // Advance timers to let retries fire (200ms + 400ms + 800ms)
    await vi.runAllTimersAsync();

    const result = await promise;
    expect(result).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(4);

    vi.useRealTimers();
  });

  it("throws SunoApiError after max retries exceeded", async () => {
    vi.useFakeTimers();

    // 4 failures (initial + 3 retries)
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");
    mockFetchError(429, "Rate limited");

    // Attach catch BEFORE running timers to avoid unhandled rejection
    const errPromise = listSongs().catch((e: unknown) => e);
    await vi.runAllTimersAsync();

    const err = await errPromise;
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 429 });
    expect(fetch).toHaveBeenCalledTimes(4); // initial + 3 retries

    vi.useRealTimers();
  });
});

// ─── Non-retryable error propagation ─────────────────────────────────────────

describe("non-retryable error propagation", () => {
  it("does not retry on 401", async () => {
    mockFetchError(401, "Unauthorized");
    await expect(listSongs()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 403", async () => {
    mockFetchError(403, "Forbidden");
    await expect(listSongs()).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 404", async () => {
    mockFetchError(404, "Not found");
    await expect(listSongs()).rejects.toMatchObject({ status: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retries on 500 and eventually throws", async () => {
    vi.useFakeTimers();

    mockFetchError(500, "Internal Server Error");
    mockFetchError(500, "Internal Server Error");
    mockFetchError(500, "Internal Server Error");
    mockFetchError(500, "Internal Server Error");

    // Attach catch BEFORE running timers to avoid unhandled rejection
    const errPromise = listSongs().catch((e: unknown) => e);
    await vi.runAllTimersAsync();

    const err = await errPromise;
    expect(err).toBeInstanceOf(SunoApiError);
    expect(err).toMatchObject({ status: 500 });
    expect(fetch).toHaveBeenCalledTimes(4); // initial + 3 retries

    vi.useRealTimers();
  });
});

// ─── sunoApi convenience export ───────────────────────────────────────────────

describe("sunoApi singleton", () => {
  it("exposes all methods", () => {
    const expectedMethods = [
      "generateSong",
      "extendMusic",
      "uploadAndCover",
      "uploadAndExtend",
      "addVocals",
      "addInstrumental",
      "generateMashup",
      "replaceSection",
      "generateLyrics",
      "getTimestampedLyrics",
      "separateVocals",
      "convertToWav",
      "generateMidi",
      "createMusicVideo",
      "generatePersona",
      "boostStyle",
      "getTaskStatus",
      "getRemainingCredits",
      "listSongs",
      "getSongById",
      "downloadSong",
      "uploadFileBase64",
      "uploadFileFromUrl",
    ];

    for (const method of expectedMethods) {
      expect(typeof sunoApi[method as keyof typeof sunoApi]).toBe("function");
    }
  });
});
