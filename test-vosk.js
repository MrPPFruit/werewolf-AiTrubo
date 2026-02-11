const fs = require('fs');
const path = require('path');
const vosk = require('vosk');

vosk.setLogLevel(0);

const modelPath = path.join(__dirname, 'public/models/vosk-model-small-cn-0.22').replace(/\\/g, '/');

console.log('Testing Vosk Native...');
console.log('Model Path:', modelPath);

if (!fs.existsSync(modelPath)) {
    console.error('ERROR: Model path does not exist!');
    process.exit(1);
}

try {
    const model = new vosk.Model(modelPath);
    console.log('SUCCESS: Model loaded!');

    // Test Recognizer
    const rec = new vosk.Recognizer({ model: model, sampleRate: 16000 });
    console.log('SUCCESS: Recognizer created!');

    rec.free();
    model.free();
} catch (error) {
    console.error('CRITICAL ERROR:', error);
}
