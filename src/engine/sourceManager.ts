import { emit, state, type SourceKind } from './state'

export interface TransportInfo {
  kind: SourceKind
  playing: boolean
  time: number
  duration: number
}

export interface SourceEvents {
  onError: (message: string) => void
  onChange: () => void
}

/**
 * Owns the current media source (image / video file / webcam).
 * Media elements stay hidden off-stage; their frames feed the shared
 * post-processed luma canvas, which drives the preview thumbnail, the luma
 * field that shapes the text, and the blend-mode stage overlay.
 */
export function createSourceManager(
  videoEl: HTMLVideoElement,
  imageEl: HTMLImageElement,
  events: SourceEvents,
) {
  let objectUrl: string | null = null
  let stream: MediaStream | null = null
  let currentFile: File | null = null

  function clearSource(): void {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      objectUrl = null
    }
    currentFile = null
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
      stream = null
    }
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.srcObject = null
    videoEl.load()
    imageEl.removeAttribute('src')
    videoEl.hidden = true
    imageEl.hidden = true
    state.sourceKind = 'none'
    state.sourceName = ''
    emit()
    events.onChange()
  }

  function fail(message: string): void {
    clearSource()
    events.onError(message)
  }

  async function useImage(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      fail(`unsupported image file: ${file.name} (${file.type || 'unknown type'})`)
      return
    }
    clearSource()
    objectUrl = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        imageEl.onload = () => resolve()
        imageEl.onerror = () => reject(new Error('decode failed'))
        imageEl.src = objectUrl!
      })
    } catch {
      fail(`could not decode image: ${file.name}`)
      return
    }
    state.sourceKind = 'image'
    state.sourceName = file.name
    currentFile = file
    emit()
    events.onChange()
  }

  async function useVideo(file: File): Promise<void> {
    if (!file.type.startsWith('video/')) {
      fail(`unsupported video file: ${file.name} (${file.type || 'unknown type'})`)
      return
    }
    clearSource()
    objectUrl = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        videoEl.onloadeddata = () => resolve()
        videoEl.onerror = () => reject(new Error('decode failed'))
        videoEl.src = objectUrl!
      })
    } catch {
      fail(`could not decode video: ${file.name}`)
      return
    }
    state.sourceKind = 'video'
    state.sourceName = file.name
    currentFile = file
    void videoEl.play().catch(() => {
      /* autoplay blocked: user can press play */
    })
    emit()
    events.onChange()
  }

  async function useWebcam(): Promise<void> {
    clearSource()
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
    } catch (err) {
      fail(`webcam unavailable: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    videoEl.srcObject = stream
    try {
      await videoEl.play()
    } catch (err) {
      fail(`webcam playback failed: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    state.sourceKind = 'webcam'
    state.sourceName = 'Webcam'
    emit()
    events.onChange()
  }

  function togglePlay(): void {
    if (state.sourceKind !== 'video') return
    if (videoEl.paused) void videoEl.play()
    else videoEl.pause()
    emit()
    events.onChange()
  }

  function seekNormalized(p: number): void {
    if (state.sourceKind !== 'video' || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return
    videoEl.currentTime = Math.max(0, Math.min(1, p)) * videoEl.duration
    events.onChange()
  }

  async function seekToTime(sec: number): Promise<void> {
    if (state.sourceKind !== 'video' || !Number.isFinite(videoEl.duration) || videoEl.duration <= 0) return
    const target = sec % videoEl.duration
    if (Math.abs(videoEl.currentTime - target) < 0.001) return
    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        videoEl.removeEventListener('seeked', onSeeked)
        resolve()
      }
      videoEl.addEventListener('seeked', onSeeked)
      videoEl.currentTime = target
    })
  }

  function getTransport(): TransportInfo {
    return {
      kind: state.sourceKind,
      playing: state.sourceKind === 'webcam' || (state.sourceKind === 'video' && !videoEl.paused),
      time: videoEl.currentTime || 0,
      duration: Number.isFinite(videoEl.duration) ? videoEl.duration : 0,
    }
  }

  /** Drawable current frame, or null when empty / not ready. */
  function getFrameSource(): CanvasImageSource | null {
    if (state.sourceKind === 'image' && imageEl.naturalWidth > 0) return imageEl
    if ((state.sourceKind === 'video' || state.sourceKind === 'webcam') && videoEl.readyState >= 2) {
      return videoEl
    }
    return null
  }

  function getSourceSize(): { width: number; height: number } | null {
    if (state.sourceKind === 'image' && imageEl.naturalWidth > 0) {
      return { width: imageEl.naturalWidth, height: imageEl.naturalHeight }
    }
    if ((state.sourceKind === 'video' || state.sourceKind === 'webcam') && videoEl.videoWidth > 0) {
      return { width: videoEl.videoWidth, height: videoEl.videoHeight }
    }
    return null
  }

  function getCurrentFile(): File | null {
    return currentFile
  }

  return {
    useImage,
    useVideo,
    useWebcam,
    togglePlay,
    seekNormalized,
    seekToTime,
    getTransport,
    getFrameSource,
    getSourceSize,
    getCurrentFile,
    clearSource,
  }
}

export type SourceManager = ReturnType<typeof createSourceManager>
