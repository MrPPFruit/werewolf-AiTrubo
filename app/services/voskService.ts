import { startVoskRecording as startRecording, stopVoskRecording as stopRecording } from './voskService';
import { useGameStore } from '../store/gameStore';

interface VoskResult {
    type: 'result' | 'partial' | 'ready';
    data: {
        text?: string;
        partial?: string;
    };
}

// Inline AudioWorklet Processor Code (to avoid file loading issues in Electron)
// This runs in the Audio Thread, separate from the UI Thread
const WORKLET_CODE = `
class VoskAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._bytesWritten = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    
    const inputChannel = input[0];
    
    // Buffer accumulator
    for (let i = 0; i < inputChannel.length; i++) {
      this._buffer[this._bytesWritten++] = inputChannel[i];
      
      if (this._bytesWritten >= this._bufferSize) {
        // Send buffer to main thread
        this.port.postMessage(this._buffer.slice(0, this._bufferSize));
        this._bytesWritten = 0;
      }
    }
    
    return true;
  }
}
registerProcessor('vosk-audio-processor', VoskAudioProcessor);
`;

let audioContext: AudioContext | null = null;
let source: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let recordingStream: MediaStream | null = null;
let isVoskInitialized = false;

export const initAudioEngine = async () => {
    return initAudioContext();
};

const initAudioContext = async () => {
    if (audioContext) {
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        return audioContext;
    }

    try {
        console.log('[SidecarVosk] Initializing AudioContext (Native 16kHz)...');
        // CRITICAL OPTIMIZATION: Force AudioContext to 16kHz
        // This makes the browser use its high-quality native resampler (usually FIR)
        // instead of us doing poor-quality linear interpolation in JS.
        audioContext = new AudioContext({
            sampleRate: 16000,
            latencyHint: 'interactive'
        });

        // Load Worklet
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);
        await audioContext.audioWorklet.addModule(workletUrl);
        console.log('[SidecarVosk] AudioWorklet Loaded. Context Sample Rate:', audioContext.sampleRate);
    } catch (e) {
        console.error('[SidecarVosk] AudioContext Init Error:', e);
        throw e;
    }
    return audioContext;
};

// Module-level callbacks & Streams
let currentOnResult: ((text: string, isFinal: boolean) => void) | null = null;
let currentOnAudioLevel: ((level: number) => void) | null = null;
let micStream: MediaStream | null = null;
let sysStream: MediaStream | null = null;

const onWorkletMessage = (event: MessageEvent) => {
    const inputData = event.data;

    // 1. Audio Level
    if (currentOnAudioLevel) {
        let sum = 0;
        const step = 32;
        for (let i = 0; i < inputData.length; i += step) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / (inputData.length / step));
        currentOnAudioLevel(Math.min(100, Math.round(rms * 400)));
    }

    // 2. Process
    const buffer = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
        let s = Math.max(-1, Math.min(1, inputData[i]));
        buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    if (buffer.byteLength > 0) {
        window.electronAPI?.voskProcessAudio(buffer);
    }
};

export const prepareAudioEngine = async () => {
    try {
        if (!window.electronAPI?.voskInit) return;

        // 1. Init Sidecar
        if (!isVoskInitialized) {
            const init = await window.electronAPI.voskInit();
            if (!init.success) throw new Error(init.error);
            useGameStore.getState().setAsrState({
                type: init.usingCloud ? 'CLOUD' : 'LOCAL',
                model: init.model || 'unknown',
                status: 'READY'
            });
            isVoskInitialized = true;
        }

        // 2. Init Context
        await initAudioContext();

        // 3. Pre-warm Microphone (Default)
        if (!micStream || !micStream.active) {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                video: false
            });
        }

    } catch (e) {
        console.error('[SidecarVosk] Preparation Error:', e);
    }
};

// Helper: Get System Audio Stream
const getSystemAudioStream = async (): Promise<MediaStream> => {
    if (sysStream && sysStream.active) return sysStream;

    try {
        const result = await window.electronAPI!.getDesktopSources();
        if (!result.success || !result.sources || result.sources.length === 0) {
            throw new Error("No screen sources found");
        }

        const source = result.sources[0]; // Primary Screen

        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id
                }
            } as any,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id
                }
            } as any
        });

        stream.getVideoTracks().forEach(track => track.stop());
        sysStream = stream;
        return stream;
    } catch (e: any) {
        console.error("Failed to get system audio:", e);
        throw e;
    }
};

export const startVoskRecording = async (
    onResult: (text: string, isFinal: boolean) => void,
    onError: (err: any) => void,
    onAudioLevel?: (level: number) => void,
    sourceType: 'MICROPHONE' | 'SYSTEM' = 'MICROPHONE'
) => {
    try {
        currentOnResult = onResult;
        currentOnAudioLevel = onAudioLevel || null;

        if (!window.electronAPI?.voskInit) throw new Error("Native API missing");

        // UNMUTE first
        if (window.electronAPI.voskSetMute) {
            await window.electronAPI.voskSetMute(false);
        }

        await prepareAudioEngine();

        if (!audioContext) throw new Error("AudioContext Init Failed");

        // SELECT SOURCE
        let targetStream: MediaStream | null = null;

        if (sourceType === 'SYSTEM') {
            targetStream = await getSystemAudioStream();
        } else {
            // Microphone (ensure active)
            if (!micStream || !micStream.active) {
                micStream = await navigator.mediaDevices.getUserMedia({
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                    video: false
                });
            }
            targetStream = micStream;
        }

        // SWAP SOURCE NODE
        if (source) {
            source.disconnect();
            source = null;
        }

        source = audioContext.createMediaStreamSource(targetStream);

        if (!workletNode) {
            workletNode = new AudioWorkletNode(audioContext, 'vosk-audio-processor');
            workletNode.port.onmessage = onWorkletMessage;
            workletNode.connect(audioContext.destination);
        }

        source.connect(workletNode);

        // Setup Listener
        window.electronAPI.offVoskResult();
        window.electronAPI.onVoskResult((msg: VoskResult) => {
            if (msg.type === 'result' && msg.data.text) {
                currentOnResult?.(msg.data.text, true);
            }
        });

        // Listen for Backend Errors
        if (window.electronAPI.onVoskError) {
            window.electronAPI.onVoskError((err: any) => {
                console.error('[SidecarVosk] Backend Error:', err);
                // If WebSocket closed, we might want to force a re-init next time
                isVoskInitialized = false;
                // Pass to UI
                onError(err);
            });
        }

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        console.log(`[SidecarVosk] Recording Started (${sourceType})`);

    } catch (e: any) {
        console.error('[SidecarVosk] Start Error:', e);
        onError(e.message || e);
    }
};

export const stopVoskRecording = async (waitForFlush = true) => {
    // 1. Commit/Flush Backend
    if (window.electronAPI?.voskFlush && waitForFlush) {
        console.log('[SidecarVosk] Flushing buffer...');
        window.electronAPI.voskFlush().catch(e => console.error(e));
        await new Promise(resolve => setTimeout(resolve, 800)); // Increased wait time
    }

    // MUTE Native Listener to prevent phantom packets from delayed flush for NEXT session
    if (window.electronAPI?.voskSetMute) {
        console.log('[SidecarVosk] Muting native listener...');
        window.electronAPI.voskSetMute(true).catch(e => console.error(e));
    }

    // 2. Suspend Audio
    if (audioContext && audioContext.state === 'running') {
        try {
            await audioContext.suspend();
            console.log('[SidecarVosk] AudioContext suspended');
        } catch (e) {
            console.warn('[SidecarVosk] Suspend Error:', e);
        }
    }

    // 3. Cleanup
    currentOnResult = null;
    currentOnAudioLevel = null;

    if (window.electronAPI?.offVoskResult) {
        window.electronAPI.offVoskResult();
    }

    // Note: We keeping sysStream/micStream active for reuse, 
    // or we could stop sysStream here if we want to stop the "Sharing" indicator.
    // For System Audio, it's polite to stop it when not recording to remove the banner.
    if (sysStream) {
        sysStream.getTracks().forEach(track => track.stop());
        sysStream = null;
    }
};
