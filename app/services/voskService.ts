import { startVoskRecording as startRecording, stopVoskRecording as stopRecording } from './voskService';
import { useGameStore } from '../store/gameStore';

// Native Electron API Type Definition
declare global {
    interface Window {
        electronAPI?: {
            isElectron: boolean;
            stopRecording: () => Promise<{ success: boolean; error?: string }>;
            voskInit: () => Promise<{ success: boolean; error?: string; usingCloud?: boolean; model?: string }>;
            voskProcessAudio: (buffer: Int16Array) => Promise<{ error?: string }>;
            onVoskResult: (callback: (data: VoskResult) => void) => void;
            offVoskResult: () => void;
            getDesktopSources: () => Promise<{ success: boolean; sources?: Array<{ id: string; name: string }>; error?: string }>;
        }
    }
}

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

export const startVoskRecording = async (
    onResult: (text: string, isFinal: boolean) => void,
    onError: (err: any) => void,
    onAudioLevel?: (level: number) => void,
    sourceType: 'MICROPHONE' | 'SYSTEM' = 'MICROPHONE'
) => {
    try {
        if (!window.electronAPI?.voskInit) {
            throw new Error("Native Vosk API not available");
        }

        // 1. Initialize Sidecar (Once)
        if (!isVoskInitialized) {
            const init = await window.electronAPI.voskInit();
            if (!init.success) {
                throw new Error(`Vosk Sidecar Init Failed: ${init.error}`);
            }
            if (init.usingCloud) {
                console.log('%c[ASR] Using Alibaba Cloud Qwen-ASR', 'color: green; font-weight: bold;');
            } else {
                console.log('[ASR] Using Local Vosk Model');
            }
            // Sync to Store
            useGameStore.getState().setAsrState({
                type: init.usingCloud ? 'CLOUD' : 'LOCAL',
                model: init.model || (init.usingCloud ? 'qwen3-asr-flash-realtime' : 'vosk-model-small-cn-0.22'),
                status: 'READY'
            });
            isVoskInitialized = true;
        }

        // 2. Pre-warm AudioContext (Parallel with Stream Request)
        const contextPromise = initAudioContext();

        // 3. Setup Listener
        window.electronAPI.onVoskResult((msg: VoskResult) => {
            if (msg.type === 'result' && msg.data.text) {
                onResult(msg.data.text, true);
            } else if (msg.type === 'partial' && msg.data.partial) {
                // onResult(msg.data.partial, false);
            }
        });

        // 4. Get Stream
        console.log(`[SidecarVosk] Requesting Source: ${sourceType}`);
        if (sourceType === 'SYSTEM') {
            recordingStream = await getSystemAudioStream();
        } else {
            recordingStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
        }
        console.log(`[SidecarVosk] Stream Granted: ${recordingStream.id}`);

        // 5. Ensure Context is Ready
        await contextPromise;
        if (!audioContext) throw new Error("AudioContext failed to initialize");

        // 6. Connect Nodes
        source = audioContext.createMediaStreamSource(recordingStream);
        workletNode = new AudioWorkletNode(audioContext, 'vosk-audio-processor');

        workletNode.port.onmessage = (event) => {
            const inputData = event.data; // Float32Array (Already 16kHz due to AudioContext setting)

            // 1. Audio Level
            if (onAudioLevel) {
                let sum = 0;
                const step = 32;
                for (let i = 0; i < inputData.length; i += step) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / (inputData.length / step));
                onAudioLevel(Math.min(100, Math.round(rms * 400)));
            }

            // 2. Convert Float32 to Int16 (No Downsampling needed)
            const buffer = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                let s = Math.max(-1, Math.min(1, inputData[i]));
                buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            if (buffer.byteLength > 0) {
                window.electronAPI?.voskProcessAudio(buffer);
            }
        };

        source.connect(workletNode);
        workletNode.connect(audioContext.destination);

        console.log('[SidecarVosk] Recording started with Native 16kHz');

    } catch (e: any) {
        console.error('[SidecarVosk] Start Error:', e);
        onError(e.message || e);
    }
};

// Helper: Get System Audio Stream via Electron desktopCapturer
async function getSystemAudioStream(): Promise<MediaStream> {
    if (!window.electronAPI?.getDesktopSources) {
        throw new Error("System Audio capture not supported in this environment");
    }

    const result = await window.electronAPI.getDesktopSources();
    if (!result.success || !result.sources || result.sources.length === 0) {
        throw new Error("No desktop sources found");
    }

    // Usually we pick the first screen "Entire Screen"
    // TODO: If needed, could filter for specific windows, but for game voice, screen audio is best.
    const sourceId = result.sources[0].id;
    console.log('[SidecarVosk] Capturing System Audio from:', sourceId, result.sources[0].name);

    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
            }
        } as any,
        video: {
            mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId
            }
        } as any
    });

    if (stream.getAudioTracks().length === 0) {
        throw new Error("No audio track found in system capture. Please check system permissions.");
    }

    return stream;
}

export const stopVoskRecording = async () => {
    if (workletNode) {
        workletNode.disconnect();
        workletNode.port.close();
        workletNode = null;
    }
    if (source) {
        source.disconnect();
        source = null;
    }
    if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
    }

    // Suspend context to save CPU, but don't close it
    if (audioContext && audioContext.state === 'running') {
        try {
            await audioContext.suspend();
            console.log('[SidecarVosk] AudioContext suspended');
        } catch (e) {
            console.warn('[SidecarVosk] Failed to suspend context:', e);
        }
    }

    if (window.electronAPI?.offVoskResult) {
        window.electronAPI.offVoskResult();
    }
    console.log('[SidecarVosk] Recording stopped (Context cached)');
};
