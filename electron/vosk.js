const vosk = require('vosk');
const path = require('path');
const fs = require('fs');

// Set log level
vosk.setLogLevel(0);

const MODEL_PATH = path.join(__dirname, '../resources/models/vosk-model-small-cn-0.22');

let model = null;
let rec = null;

/**
 * Loads the Vosk model from the filesystem.
 */
function loadModel() {
    if (model) return;

    // Check if model exists
    if (!fs.existsSync(MODEL_PATH)) {
        console.error('[Vosk] Model not found at:', MODEL_PATH);
        throw new Error('Vosk model not found. Please run the download script.');
    }

    console.log('[Vosk] Loading model from:', MODEL_PATH);
    try {
        model = new vosk.Model(MODEL_PATH);
        console.log('[Vosk] Model loaded successfully.');
    } catch (e) {
        console.error('[Vosk] Failed to load model:', e);
        throw e;
    }
}

/**
 * Starts a new recognition session.
 * @param {number} sampleRate Sample rate (default 16000)
 */
function startRecognizer(sampleRate = 16000) {
    if (!model) loadModel();

    if (rec) {
        // Cleanup existing recognizer if any
        rec.free();
        rec = null;
    }

    try {
        rec = new vosk.Recognizer({ model: model, sampleRate: sampleRate });
        console.log('[Vosk] Recognizer started with sample rate:', sampleRate);
        return true;
    } catch (e) {
        console.error('[Vosk] Failed to create recognizer:', e);
        return false;
    }
}

/**
 * Processes an audio chunk (Buffer).
 * Returns { partial: string } or { text: string } or null.
 * @param {Buffer} chunk PCM audio chunk
 */
function processAudioChunk(chunk) {
    if (!rec) return null;

    // acceptWaveform returns true if a result (silence/full text) is ready
    // returns false if it's still processing partials
    const isFinal = rec.acceptWaveform(chunk);

    if (isFinal) {
        return { type: 'final', ...rec.result() };
    } else {
        return { type: 'partial', ...rec.partialResult() };
    }
}

/**
 * Stops recognition and returns final result.
 */
function stopRecognizer() {
    if (rec) {
        const finalResult = rec.finalResult();
        console.log('[Vosk] Recognizer stopped. Final result:', finalResult);
        rec.free();
        rec = null;
        return { type: 'final', ...finalResult };
    }
    return null;
}

/**
 * Frees the model to save memory (optional).
 */
function freeModel() {
    if (model) {
        model.free();
        model = null;
        console.log('[Vosk] Model freed.');
    }
}

module.exports = {
    loadModel,
    startRecognizer,
    processAudioChunk,
    stopRecognizer,
    freeModel
};
