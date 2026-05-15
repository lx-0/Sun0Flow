/// <reference lib="webworker" />

// Web Worker: receives a Float32Array of decoded audio samples and the
// requested bar count; returns normalised peak amplitudes. Runs the
// O(samples) for-loop off the main thread so cover-swiping doesn't jank
// on mobile.

interface RequestMessage {
  id: number;
  samples: Float32Array;
  numBars: number;
}

interface ResponseMessage {
  id: number;
  peaks: Float32Array;
}

self.addEventListener("message", (e: MessageEvent<RequestMessage>) => {
  const { id, samples, numBars } = e.data;

  const blockSize = Math.max(1, Math.floor(samples.length / numBars));
  const peaks = new Float32Array(numBars);

  for (let i = 0; i < numBars; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, samples.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }

  let maxVal = 0.01;
  for (let i = 0; i < peaks.length; i++) {
    if (peaks[i] > maxVal) maxVal = peaks[i];
  }
  for (let i = 0; i < peaks.length; i++) peaks[i] /= maxVal;

  const response: ResponseMessage = { id, peaks };
  (self as DedicatedWorkerGlobalScope).postMessage(response, [peaks.buffer]);
});

export {};
