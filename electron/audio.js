/**
 * System Audio Capture Module for Windows
 * 
 * This module provides system audio capture functionality using node-record-lpcm16
 * with WASAPI loopback mode to capture system audio output.
 */

const recorder = require('node-record-lpcm16');
const speech = require('@google-cloud/speech');

// Initialize Google Cloud Speech client (requires API key configuration)
const speechClient = new speech.SpeechClient({
    // User should configure credentials via environment variable:
    // GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
});

/**
 * Start capturing system audio and transcribe in real-time
 * @param {Function} onTranscription - Callback function receiving transcribed text
 * @returns {Object} Recording instance with stop() method
 */
function startSystemAudioCapture(onTranscription) {
    const encoding = 'LINEAR16';
    const sampleRateHertz = 16000;
    const languageCode = 'zh-CN';

    const request = {
        config: {
            encoding: encoding,
            sampleRateHertz: sampleRateHertz,
            languageCode: languageCode,
            enableAutomaticPunctuation: true,
        },
        interimResults: false,
    };

    // Create a recognize stream
    const recognizeStream = speechClient
        .streamingRecognize(request)
        .on('error', (error) => {
            console.error('Speech recognition error:', error);
        })
        .on('data', (data) => {
            if (data.results[0] && data.results[0].alternatives[0]) {
                const transcription = data.results[0].alternatives[0].transcript;
                onTranscription(transcription);
            }
        });

    // Start recording system audio
    const recording = recorder.record({
        sampleRate: sampleRateHertz,
        channels: 1,
        audioType: 'raw',
        // CRITICAL: Use 'loopback' device to capture system audio output
        // This captures what the computer is playing (e.g., Tencent Meeting audio)
        device: 'loopback',
        recorder: 'sox', // or 'rec' depending on system
    });

    // Pipe audio stream to speech recognition
    recording.stream().pipe(recognizeStream);

    return {
        stop: () => {
            recording.stop();
            recognizeStream.end();
        },
    };
}

module.exports = {
    startSystemAudioCapture,
};
