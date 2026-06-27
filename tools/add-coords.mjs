#!/usr/bin/env node
/*
 * add-coords.mjs — idempotent: adds `lat`/`lng` to every city in cities.json.
 *
 * Coordinates are city-centre approximations (decimal degrees, WGS84). They only
 * need to be good enough to place a marker on a globe, not to navigate. Re-running
 * this is safe: it only fills cities that are missing coordinates (pass --force to
 * overwrite existing ones).
 *
 *   node tools/add-coords.mjs           # fill missing
 *   node tools/add-coords.mjs --force   # overwrite all from the table below
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "cities.json");
const force = process.argv.includes("--force");

// keyed by exact `city` string in cities.json
const COORDS = {
  // Southeast Asia
  "Bangkok": [13.7563, 100.5018],
  "Chiang Mai": [18.7883, 98.9853],
  "Hanoi": [21.0278, 105.8342],
  "Da Nang": [16.0544, 108.2022],
  "Ho Chi Minh City": [10.8231, 106.6297],
  "Canggu": [-8.6478, 115.1385],
  "Ubud": [-8.5069, 115.2625],
  "Kuala Lumpur": [3.1390, 101.6869],
  "George Town (Penang)": [5.4141, 100.3288],
  "Siem Reap": [13.3671, 103.8448],
  "Phnom Penh": [11.5564, 104.9282],
  "Luang Prabang": [19.8834, 102.1347],
  "Vientiane": [17.9757, 102.6331],
  "Singapore": [1.3521, 103.8198],
  // East Asia
  "Tokyo": [35.6762, 139.6503],
  "Osaka": [34.6937, 135.5023],
  "Kyoto": [35.0116, 135.7681],
  "Fukuoka": [33.5904, 130.4017],
  "Naha (Okinawa)": [26.2124, 127.6809],
  "Hiroshima": [34.3853, 132.4553],
  "Sapporo": [43.0618, 141.3545],
  "Seoul": [37.5665, 126.9780],
  "Busan": [35.1796, 129.0756],
  "Taipei": [25.0330, 121.5654],
  "Hong Kong": [22.3193, 114.1694],
  "Beijing": [39.9042, 116.4074],
  "Shanghai": [31.2304, 121.4737],
  "Chengdu": [30.5728, 104.0668],
  // South Asia
  "Delhi": [28.6139, 77.2090],
  "Goa": [15.2993, 74.1240],
  "Bengaluru": [12.9716, 77.5946],
  "Kathmandu": [27.7172, 85.3240],
  "Pokhara": [28.2096, 83.9856],
  "Colombo": [6.9271, 79.8612],
  "Kandy & Ella": [7.2906, 80.6337],
  "Dhaka": [23.8103, 90.4125],
  "Cox's Bazar": [21.4272, 92.0058],
};

const data = JSON.parse(readFileSync(FILE, "utf8"));
let filled = 0, missing = [];
for (const c of data.cities) {
  const co = COORDS[c.city];
  if (!co) { missing.push(c.city); continue; }
  if (force || c.lat == null || c.lng == null) {
    c.lat = co[0]; c.lng = co[1]; filled++;
  }
}
writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
console.log(`add-coords: set coordinates on ${filled} city/cities.`);
if (missing.length) console.warn(`add-coords: WARNING no coords for: ${missing.join(", ")}`);
