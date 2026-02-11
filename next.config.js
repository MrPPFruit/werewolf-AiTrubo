/** @type {import('next').NextConfig} */
const nextConfig = {
    // output: 'export', // Commented out to allow headers functioning in dev mode. 
    // If you need static export, headers won't apply there anyway (need server config).
    // For Electron dev (localhost), we need these headers.
    output: 'export',

    // Headers for SharedArrayBuffer (required for Vosk/WASM threads)
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                    {
                        key: 'Cross-Origin-Embedder-Policy',
                        value: 'require-corp',
                    },
                ],
            },
        ];
    },
};

module.exports = nextConfig;
