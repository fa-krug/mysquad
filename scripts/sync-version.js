#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';

const version = process.argv[2];
if (!version) {
  console.error('Usage: sync-version.js <version>');
  process.exit(1);
}

// Update src-tauri/tauri.conf.json
const tauriConfPath = 'src-tauri/tauri.conf.json';
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = version;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');
console.log(`Updated ${tauriConfPath} to version ${version}`);

// Update src-tauri/Cargo.toml
const cargoPath = 'src-tauri/Cargo.toml';
let cargo = readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
writeFileSync(cargoPath, cargo);
console.log(`Updated ${cargoPath} to version ${version}`);
