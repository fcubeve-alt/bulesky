// A small, business-agnostic in-page video recorder.
//
// It records a <canvas> (via captureStream) plus an optional audio track into
// a Blob using MediaRecorder — no getDisplayMedia, so nothing of the system UI
// (status bar, address bar, other windows) is ever captured. The caller draws
// whatever it wants onto the canvas; this module only wires the streams,
// records, and hands back a Blob it can preview / download / share.
//
// Reusable: it knows nothing about whispers or balloons.

export function isRecordingSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder === 'function' &&
    typeof document.createElement('canvas').captureStream === 'function'
  );
}

// Pick a container/codec the current browser can actually record.
// Chromium → webm(vp9/vp8); Safari → mp4(h264). Returns '' to let the
// browser choose if none match.
function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4;codecs=h264,aac',
    'video/mp4',
  ];
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export class VideoRecorderEngine {
  /**
   * @param {HTMLCanvasElement} canvas  the picture to record
   * @param {MediaStreamTrack[]} audioTracks  optional audio tracks to mix in
   * @param {{fps?:number}} options
   */
  constructor(canvas, audioTracks = [], options = {}) {
    this.canvas = canvas;
    this.audioTracks = audioTracks.filter(Boolean);
    this.fps = options.fps || 30;
    this.recorder = null;
    this.chunks = [];
    this.stream = null;
    this.mimeType = '';
  }

  start() {
    const video = this.canvas.captureStream(this.fps);
    const tracks = [...video.getVideoTracks(), ...this.audioTracks];
    this.stream = new MediaStream(tracks);
    this.mimeType = pickMimeType();
    this.recorder = this.mimeType
      ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
      : new MediaRecorder(this.stream);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this.chunks.push(e.data);
    };
    this.recorder.start(200); // gather chunks periodically
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.recorder) return reject(new Error('not recording'));
      this.recorder.onstop = () => {
        const type = (this.mimeType || 'video/webm').split(';')[0];
        const blob = new Blob(this.chunks, { type });
        // Stop only the video track we created; leave shared audio tracks alone.
        this.stream.getVideoTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      try {
        this.recorder.stop();
      } catch (e) {
        reject(e);
      }
    });
  }

  get extension() {
    return (this.mimeType || 'video/webm').includes('mp4') ? 'mp4' : 'webm';
  }

  static previewUrl(blob) {
    return URL.createObjectURL(blob);
  }

  static download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // Share the file via the native sheet when possible; otherwise download.
  static async share(blob, filename, text) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return 'shared';
      } catch {
        return 'cancelled';
      }
    }
    VideoRecorderEngine.download(blob, filename);
    return 'downloaded';
  }
}
