#!/usr/bin/env node
/**
 * Génère les icônes PWA à partir du monogramme Agilmea.
 *
 *   node scripts/generate-icons.mjs
 *
 * Le PNG est écrit à la main — signature, IHDR, IDAT compressé par zlib, IEND —
 * plutôt qu'avec une bibliothèque de rendu : l'icône se résume à deux polygones
 * et quatre traits, ce qui ne justifie pas une dépendance. Le résultat est
 * reproductible et versionné avec le reste du projet.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* Couleurs de marque, identiques à celles du logo et de la feuille de style. */
const INK = [27, 42, 74];
const GOLD = [176, 141, 79];
const WHITE = [255, 255, 255];

/** Les deux jambages du « A », en coordonnées 0-100. */
const STROKES = [
  [
    [56, 8],
    [70, 8],
    [34, 92],
    [20, 92],
  ],
  [
    [53, 34],
    [64, 34],
    [88, 92],
    [74, 92],
  ],
];

/** Le cadre doré : quatre segments, volontairement disjoints aux angles. */
const FRAME = [
  [22, 20, 78, 20],
  [22, 20, 22, 80],
  [22, 80, 78, 80],
  [78, 20, 78, 80],
];

const FRAME_WIDTH = 4;

function renderIcon(size) {
  const scale = size / 100;
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Centre du pixel, ramené dans le repère 0-100 du dessin.
      const u = (x + 0.5) / scale;
      const v = (y + 0.5) / scale;

      let color = WHITE;
      if (onFrame(u, v)) color = GOLD;
      if (STROKES.some((polygon) => inPolygon(u, v, polygon))) color = INK;

      const offset = (y * size + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }

  return encodePng(size, size, pixels);
}

function onFrame(u, v) {
  const half = FRAME_WIDTH / 2;
  return FRAME.some(([x1, y1, x2, y2]) => {
    const withinX = u >= Math.min(x1, x2) - half && u <= Math.max(x1, x2) + half;
    const withinY = v >= Math.min(y1, y2) - half && v <= Math.max(y1, y2) + half;
    if (!withinX || !withinY) return false;
    // Segment horizontal ou vertical : la distance se réduit à un axe.
    return y1 === y2 ? Math.abs(v - y1) <= half : Math.abs(u - x1) <= half;
  });
}

/** Test d'appartenance par lancer de rayon. */
function inPolygon(u, v, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ */
/* Encodage PNG                                                        */
/* ------------------------------------------------------------------ */

function encodePng(width, height, rgba) {
  // Chaque ligne est précédée de son octet de filtre, ici 0 (aucun filtre).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8 bits par canal
  ihdr[9] = 6; // RVB + alpha
  // 10, 11, 12 restent à 0 : compression, filtrage et entrelacement standard.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */

for (const size of [192, 512]) {
  const file = resolve(rootDir, `public/icon-${size}.png`);
  const png = renderIcon(size);
  writeFileSync(file, png);
  console.log(`icon-${size}.png — ${(png.length / 1024).toFixed(1)} Ko`);
}
