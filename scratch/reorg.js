const fs = require('fs');
const path = require('path');

const mappings = {
    '@/lib/google/calendar': '@/lib/google/calendar',
    '@/lib/google/chat': '@/lib/google/chat',
    '@/lib/google/directory': '@/lib/google/directory',
    '@/lib/google/drive': '@/lib/google/drive',
    '@/lib/google/forms': '@/lib/google/forms',
    '@/lib/google/oauth': '@/lib/google/oauth',
    '@/lib/google/sheets': '@/lib/google/sheets',
    '@/lib/trello/client': '@/lib/trello/client',
    '@/lib/wiki/sections': '@/lib/wiki/sections',
    '@/lib/wiki/utils': '@/lib/wiki/utils',
    '@/lib/events/clash': '@/lib/events/clash',
    '@/lib/events/sim': '@/lib/events/sim',
    '@/lib/events/trello': '@/lib/events/trello',
    '@/lib/events/user': '@/lib/events/user',
    '@/lib/core/logger': '@/lib/core/logger',
    '@/lib/core/trpc': '@/lib/core/trpc',
    '@/lib/core/utils': '@/lib/core/utils',
    '@/lib/core/providers': '@/lib/core/providers',
    '@/lib/google/oauth-connect': '@/lib/google/oauth-connect'
};

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        if (isDirectory) {
            if (f !== 'node_modules' && f !== '.next' && f !== '.git') {
                walkDir(dirPath, callback);
            }
        } else {
            callback(path.join(dir, f));
        }
    });
}

const root = process.cwd();
console.log('Starting refactor in', root);

walkDir(root, (filePath) => {
    if (!filePath.match(/\.(ts|tsx|js|jsx)$/)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    for (const [oldPath, newPath] of Object.entries(mappings)) {
        // Match both single and double quotes
        const regex = new RegExp(`(['"])${oldPath}(['"])`, 'g');
        if (regex.test(content)) {
            content = content.replace(regex, `$1${newPath}$2`);
            changed = true;
        }
    }

    if (changed) {
        console.log('Updating:', filePath);
        fs.writeFileSync(filePath, content, 'utf8');
    }
});

console.log('Refactor complete.');
