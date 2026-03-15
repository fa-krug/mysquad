#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const tauriConf = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const version = process.argv[2] || tauriConf.version;
const repo = 'https://github.com/fa-krug/mysquad/releases/download';

const macosDir = 'src-tauri/target/release/bundle/macos';
const nsisDir = 'src-tauri/target/release/bundle/nsis';

function readSig(dir, pattern) {
  const files = readdirSync(dir);
  const sigFile = files.find((f) => f.endsWith('.sig') && f.includes(pattern));
  return sigFile ? readFileSync(join(dir, sigFile), 'utf8').trim() : '';
}

function findFile(dir, ext) {
  const files = readdirSync(dir);
  return files.find((f) => f.endsWith(ext) && !f.endsWith('.sig'));
}

const tarGz = findFile(macosDir, '.tar.gz');
const exe = findFile(nsisDir, '.exe');

const latest = {
  version: `v${version}`,
  notes: `Release v${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'darwin-aarch64': {
      signature: readSig(macosDir, '.tar.gz'),
      url: `${repo}/v${version}/${tarGz}`,
    },
    'darwin-x86_64': {
      signature: readSig(macosDir, '.tar.gz'),
      url: `${repo}/v${version}/${tarGz}`,
    },
    'windows-x86_64': {
      signature: readSig(nsisDir, '.exe'),
      url: `${repo}/v${version}/${exe}`,
    },
  },
};

writeFileSync('latest.json', JSON.stringify(latest, null, 2) + '\n');
console.log('Generated latest.json for version', version);
