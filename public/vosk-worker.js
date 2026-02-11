// Vosk Service Worker
// Handles speech recognition in a separate thread to prevent UI freezing

importScripts('/vosk.js');

let recognizer = null;
let model = null;

onmessage = async (e) => {
    const { action, data, sampleRate, modelUrl } = e.data;

    if (action === 'init') {
        try {
            console.log('[VoskWorker] Initializing...');

            // Checks if Vosk is loaded
            if (typeof Vosk === 'undefined') {
                throw new Error("Vosk library not loaded");
            }

            const voskModel = await Vosk.createModel(modelUrl);
            model = voskModel;

            recognizer = new model.KaldiRecognizer(sampleRate);

            // Configure results
            recognizer.on("result", (message) => {
                postMessage({ type: 'result', text: message.result.text });
            });

            recognizer.on("partialresult", (message) => {
                postMessage({ type: 'partial', text: message.result.partial });
            });

            console.log('[VoskWorker] Initialized');
            postMessage({ type: 'ready' });
        } catch (err) {
            console.error('[VoskWorker] Init failed', err);
            postMessage({ type: 'error', error: err.toString() });
        }
    }

    if (action === 'process') {
        if (!recognizer) return;
        try {
            // content of data is Int16Array or Float32Array
            // If Float32, we convert here? 
            // Better to receive AudioBuffer-like data or Int16 from main thread
            // The main thread already converts to Int16 now.
            // But wait, we can't pass "AudioBuffer" to worker easily unless we transfer channel data.
            // The main thread passes serialized float32 or int16 array.

            // Ensure data is typed correctly for Emscripten
            // If we receive Int16Array, we can pass it to acceptWaveform?
            // vosk-browser's acceptWaveform implementation handles typed arrays usually.

            // Note: If data is Int16Array, we might need to copy it to WASM heap?
            // vosk-browser wrapper handles this if we pass the array.
            recognizer.acceptWaveform(data);
        } catch (err) {
            console.error('[VoskWorker] Process failed', err);
        }
    }

    if (action === 'terminate') {
        if (recognizer) {
            recognizer.remove();
            recognizer = null;
        }
        if (model) {
            model.terminate();
            model = null;
        }
        postMessage({ type: 'terminated' });
    }
};
