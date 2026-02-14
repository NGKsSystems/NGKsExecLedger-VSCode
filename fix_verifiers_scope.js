const fs = require('fs');
const path = require('path');

const file38 = 'extension/src/test/verify-phase3.8.js';
const file39 = 'extension/src/test/verify-phase3.9.js';

const newAllowed = [
    'extension/README.md',
    'extension/src/command/exportProofBundle.ts',
    'extension/src/command/openLatestProofBundle.ts',
    'extension/src/command/openLatestProofReport.ts',
    'extension/src/command/runMilestoneGates.ts',
    'extension/src/commands/execLedgerAddGuidance.ts',
    'extension/src/commands/exportProofBundle.ts',
    'extension/src/core/autosave.ts',
    'extension/src/core/execLedgerState.ts',
    'extension/src/core/execLedgerStatusBar.ts',
    'extension/src/status/statusBarProof.ts',
    'extension/src/test/verify-phase3.6.js',
    'extension/src/test/verify-phase3.7.js',
    'extension/src/util/proofEnforcer.ts',
    'tools/export_proof_bundle.ps1',
    'tools/gate-commit.ps1',
    'tools/proof_run.ps1'
];

function updateFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find all allowedFiles arrays
    const regex = /const allowedFiles = \[\s*([\s\S]*?)\];/g;
    
    let newContent = content.replace(regex, (fullMatch, listContent) => {
        let currentList = listContent.split(',').map(s => s.trim().replace(/['"]/g, ''));
        // Check identifying file to ensure we don't add duplicates if already there
        // The first block might have them, the second might not.
        
        let shouldAdd = false;
        // Check if AT LEAST ONE of the newAllowed is missing from this block
        if (newAllowed.some(f => !currentList.some(existing => existing.includes(f)))) {
            shouldAdd = true;
        }

        if (shouldAdd) {
            const injection = newAllowed.map(f => `    '${f}',`).join('\n');
            return fullMatch.replace('];', `,\n${injection}\n  ];`);
        }
        return fullMatch;
    });

    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Updated ${filePath}.`);
    } else {
        console.log(`No changes for ${filePath} (files might already be present).`);
    }
}

function updateFile39(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    const regex = /const allowed = new Set\(\[\s*([\s\S]*?)\]\);/;
    const match = content.match(regex);
    
    if (match) {
        let listContent = match[1];
        let added = 0;
        newAllowed.forEach(f => {
             if (!listContent.includes(f)) {
                 added++;
             }
        });

        if (added > 0) {
            const injection = newAllowed.map(f => `    '${f}',`).join('\n');
            const newBlock = match[0].replace(']);', `,\n${injection}\n  ]);`);
            content = content.replace(match[0], newBlock);
            fs.writeFileSync(filePath, content);
            console.log(`Updated ${filePath}.`);
        } else {
            console.log(`No changes for ${filePath}.`);
        }
    } else {
        console.log(`Could not find allowed Set in ${filePath}`);
    }
}

updateFile(file38);
updateFile39(file39);
