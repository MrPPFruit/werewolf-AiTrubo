const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip';
// Move to public/models so it's accessible by browser
const DEST_DIR = path.join(__dirname, '../public/models');
const ZIP_PATH = path.join(DEST_DIR, 'vosk-model-small-cn-0.22.zip');

if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
}

if (fs.existsSync(ZIP_PATH)) {
    console.log('Model zip already exists at:', ZIP_PATH);
    process.exit(0);
}

console.log('Downloading model to public/models for WASM usage...');
const file = fs.createWriteStream(ZIP_PATH);

https.get(MODEL_URL, (response) => {
    if (response.statusCode !== 200) {
        console.error('Failed to download model, status code:', response.statusCode);
        process.exit(1);
    }

    const totalSize = parseInt(response.headers['content-length'], 10);
    let downloadedSize = 0;

    response.pipe(file);

    response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
            const percentage = ((downloadedSize / totalSize) * 100).toFixed(2);
            process.stdout.write(`Downloading: ${percentage}%\r`);
        }
    });

    file.on('finish', () => {
        file.close(() => {
            console.log('\nDownload completed:', ZIP_PATH);
            process.exit(0);
        });
    });
}).on('error', (err) => {
    fs.unlink(ZIP_PATH, () => { });
    console.error('Download error:', err.message);
    process.exit(1);
});
