import { addInstrumental, addVocals, generateMashup, replaceSection, uploadAndCover, uploadAndExtend } from "./upload-based";
import { boostStyle, generatePersona } from "./persona";
import { convertToWav, createMusicVideo, generateMidi, separateVocals } from "./audio";
import { downloadSong, getSongById, listSongs } from "./songs";
import { fetchFreshUrls } from "./refresh";
import { generateCoverImage, generateSounds } from "./media";
import { generateLyrics, getTimestampedLyrics } from "./lyrics";
import { generateSong, extendMusic } from "./create";
import { getCoverImageDetail, getLyricsDetail, getMidiDetail, getMusicVideoDetail, getVocalSeparationDetail, getWavConversionDetail } from "./task-detail";
import { getRemainingCredits, getTaskStatus } from "./status";
import { uploadFileBase64, uploadFileFromUrl, uploadFileStream } from "./uploads";

export const sunoApi = {
  generateSong,
  extendMusic,
  uploadAndCover,
  uploadAndExtend,
  addVocals,
  addInstrumental,
  generateMashup,
  replaceSection,
  generateSounds,
  generateCoverImage,
  generateLyrics,
  getTimestampedLyrics,
  separateVocals,
  convertToWav,
  generateMidi,
  createMusicVideo,
  generatePersona,
  boostStyle,
  getTaskStatus,
  getRemainingCredits,
  getLyricsDetail,
  getVocalSeparationDetail,
  getWavConversionDetail,
  getMusicVideoDetail,
  getMidiDetail,
  getCoverImageDetail,
  listSongs,
  getSongById,
  downloadSong,
  uploadFileBase64,
  uploadFileFromUrl,
  uploadFileStream,
  fetchFreshUrls,
} as const;
