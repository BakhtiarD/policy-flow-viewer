const fs = require('fs');
const path = require('path');

/* Локальные хелперы — чтобы не зависеть от require('./utils'),
   который в среде adinsure-studio может резолвиться в media/modules/utils.js. */
function stripBom(s) {
    if (typeof s !== 'string') return s;
    return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
}

function indexOf(header) {
    const map = {};
    if (!Array.isArray(header)) return map;
    for (let i = 0; i < header.length; i++) map[header[i]] = i;
    return map;
}

function parseCsv(text) {
    const trailingNewline = text.endsWith('\n');
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (!lines.length) return { header: [], rows: [], trailingNewline };
    const header = lines[0].split('\t');
    const rows = lines.slice(1).map(l => {
        const parts = l.split('\t');
        while (parts.length < header.length) parts.push('');
        return parts;
    });
    return { header, rows, trailingNewline };
}

// Собирает роли из configuration/@config-*/application-user-group/groupAuthorization.csv.
// node_modules НЕ трогаем.
function collectGroupRoles(projectRoot) {
    const roles = new Set();
    if (!projectRoot) return roles;

    const configDir = path.join(projectRoot, 'configuration');
    if (!fs.existsSync(configDir)) return roles;

    let nsEntries;
    try { nsEntries = fs.readdirSync(configDir, { withFileTypes: true }); }
    catch { return roles; }

    for (const ns of nsEntries) {
        if (!ns.isDirectory() || !ns.name.startsWith('@config-')) continue;
        const nsPath = path.join(configDir, ns.name);

        let pkgEntries;
        try { pkgEntries = fs.readdirSync(nsPath, { withFileTypes: true }); }
        catch { continue; }

        for (const p of pkgEntries) {
            if (!p.isDirectory()) continue;
            const csvPath = path.join(
                nsPath, p.name,
                'authorization', 'groupAuthorization.csv'
            );
            if (!fs.existsSync(csvPath)) continue;

            try {
                const csv = parseCsv(stripBom(fs.readFileSync(csvPath, 'utf8')));
                const idx = indexOf(csv.header);
                for (const row of csv.rows) {
                    const role = row[idx['ApplicationRole']];
                    if (role) roles.add(role);
                }
            } catch (e) {
                console.error('groupAuthorization parse error:', csvPath, e.message);
            }
        }
    }
    return roles;
}

module.exports = { collectGroupRoles };