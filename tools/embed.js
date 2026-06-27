#!/usr/bin/env node
/*
 * embed.js — keeps the offline copy of the data in sync with cities.json.
 *
 * index.html ships with an embedded snapshot (`var EMBEDDED_DATA = {…};`) so that
 * double-clicking the file works with no server. cities.json is the single source
 * of truth. This script regenerates that embedded snapshot from cities.json so the
 * two can never drift by hand.
 *
 *   npm run embed
 *
 * Exit code 1 if it can't find the markers (so CI / you notice instead of shipping
 * a half-written file).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const HTML = path.join(ROOT, "index.html");
const JSON_FILE = path.join(ROOT, "cities.json");

const data = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
let html = fs.readFileSync(HTML, "utf8");

// The block runs from `var EMBEDDED_DATA = {` up to the unique line that follows it.
const END_ANCHOR = "var CITIES=[], COUNTRIES={};";
const re = /var EMBEDDED_DATA = [\s\S]*?;\r?\nvar CITIES=\[\], COUNTRIES=\{\};/;

if (!re.test(html)) {
  console.error("embed: could not find the EMBEDDED_DATA block (or the '" + END_ANCHOR + "' anchor) in index.html. Aborting without writing.");
  process.exit(1);
}

const replacement = "var EMBEDDED_DATA = " + JSON.stringify(data, null, 2) + ";\n" + END_ANCHOR;
const next = html.replace(re, replacement);

if (next === html) {
  console.log("embed: already up to date.");
} else {
  fs.writeFileSync(HTML, next);
  console.log(`embed: re-embedded ${data.cities.length} cities / ${Object.keys(data.countries).length} countries into index.html.`);
}
