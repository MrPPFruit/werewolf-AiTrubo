const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class Logger {
    constructor() {
        this.logDir = path.join(app.getPath('userData'), 'logs');
        this.logFile = path.join(this.logDir, 'app.log');
        this.maxSize = 50 * 1024 * 1024; // 50MB
        this.backups = 5;

        this.ensureDir();
    }

    ensureDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.map(arg => {
            if (arg instanceof Error) return arg.stack || arg.message;
            if (typeof arg === 'object') return JSON.stringify(arg);
            return arg;
        }).join(' ');
        return `[${timestamp}] [${level}] ${message} ${formattedArgs}\n`;
    }

    checkRotate() {
        try {
            if (fs.existsSync(this.logFile)) {
                const stats = fs.statSync(this.logFile);
                if (stats.size >= this.maxSize) {
                    this.rotate();
                }
            }
        } catch (e) {
            console.error('Log rotation check failed:', e);
        }
    }

    rotate() {
        try {
            // Delete last backup
            const lastBackup = path.join(this.logDir, `app.log.${this.backups}`);
            if (fs.existsSync(lastBackup)) {
                fs.unlinkSync(lastBackup);
            }

            // Shift backups
            for (let i = this.backups - 1; i >= 1; i--) {
                const src = path.join(this.logDir, `app.log.${i}`);
                const dest = path.join(this.logDir, `app.log.${i + 1}`);
                if (fs.existsSync(src)) {
                    fs.renameSync(src, dest);
                }
            }

            // Rename current to .1
            const firstBackup = path.join(this.logDir, 'app.log.1');
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, firstBackup);
            }
        } catch (e) {
            console.error('Log rotation failed:', e);
        }
    }

    write(level, message, ...args) {
        const msg = this.formatMessage(level, message, ...args);

        // Console output (always useful for dev/terminal)
        if (level === 'ERROR') console.error(msg.trim());
        else console.log(msg.trim());

        try {
            this.checkRotate();
            fs.appendFileSync(this.logFile, msg, { encoding: 'utf8' });
        } catch (e) {
            console.error('Failed to write log:', e);
        }
    }

    info(message, ...args) { this.write('INFO', message, ...args); }
    warn(message, ...args) { this.write('WARN', message, ...args); }
    error(message, ...args) { this.write('ERROR', message, ...args); }
    debug(message, ...args) { this.write('DEBUG', message, ...args); }
}

module.exports = new Logger();
