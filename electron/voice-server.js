const fs = require('fs');
const path = require('path');
const vosk = require('vosk');

// Disable Vosk debug logs in production
vosk.setLogLevel(-1);

const MODEL_PATH = process.argv[2];

if (!MODEL_PATH || !fs.existsSync(MODEL_PATH)) {
    console.error(`[VoiceServer] Model path invalid: ${MODEL_PATH}`);
    process.exit(1);
}

const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: 16000 });

// Handle Stdin (Audio Data)
process.stdin.on('data', (chunk) => {
    try {
        if (rec.acceptWaveform(chunk)) {
            const result = rec.result();
            // result is object { text: "..." }
            if (result.text) {
                console.log(JSON.stringify({ type: 'result', data: result }));
            }
        } else {
            const partial = rec.partialResult();
            // partial is object { partial: "..." }
            if (partial.partial) {
                console.log(JSON.stringify({ type: 'partial', data: partial }));
            }
        }
    } catch (e) {
        console.error(`[VoiceServer] Error processing chunk: ${e.message}`);
    }
});

// Signal readiness
console.log(JSON.stringify({ type: 'ready' }));

// Keep process alive
process.stdin.resume();
