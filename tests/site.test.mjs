// End-to-end tests: the real index.html in Chromium, talking to the local Firebase emulators.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { createRequire } from "node:module";
import { doc, getDoc, getDocs, setDoc, collection } from "firebase/firestore";
import { testEnv, ROOT, PROJECT } from "./helpers.mjs";

const { chromium } = createRequire(import.meta.url)("playwright");
const FB_DIR = join(ROOT, "tests/node_modules/firebase/");
const TEST_CONFIG = `window.EURIKA_FIREBASE={apiKey:"fake-api-key",authDomain:"${PROJECT}.firebaseapp.com",projectId:"${PROJECT}",appId:"1:1:web:1"};
window.EURIKA_FIREBASE_TEST={emulatorHost:"127.0.0.1",sendTimeoutMs:4000};`;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg" };

let env, server, browser, base;
const pageErrors = [];
const OWNER = { email: "owner@example.com", password: "correct-horse-1" };
const OTHER = { email: "someone@example.com", password: "not-an-owner-1" };

async function authUser(u) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...u, returnSecureToken: true }) });
  return (await r.json()).localId;
}
async function allOrders() {
  let out = [];
  await env.withSecurityRulesDisabled(async (c) => { out = (await getDocs(collection(c.firestore(), "orders"))).docs.map((d) => ({ id: d.id, ...d.data() })); });
  return out;
}
async function orderDoc(ref) {
  let out;
  await env.withSecurityRulesDisabled(async (c) => { const s = await getDoc(doc(c.firestore(), "orders", ref)); out = s.exists() ? s.data() : null; });
  return out;
}
async function page({ live = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route("https://www.gstatic.com/firebasejs/**", (r) => {
    const f = FB_DIR + new URL(r.request().url()).pathname.split("/").pop();
    return existsSync(f) ? r.fulfill({ body: readFileSync(f), contentType: "text/javascript" }) : r.abort();
  });
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.abort());
  if (live) await ctx.route("**/firebase-config.js", (r) => r.fulfill({ body: TEST_CONFIG, contentType: "text/javascript" }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => pageErrors.push(e.message));
  return p;
}
async function fillCart(p, name) {
  await p.goto(base + "/#trays");
  await p.click('[data-add="p4999"]');
  await p.click("#cfAdd");
  await p.click("#cartBtn");
  await p.click("#toCheckout");
  await p.fill("#coName", name);
  await p.fill("#coPhone", "0917 123 4567");
  await p.click('#coForm button[type="submit"]');
  await p.waitForSelector("#sendBtn");
}
async function ownerSignIn(p, u = OWNER) {
  await p.goto(base + "/#owner");
  await p.waitForSelector("#lEmail");
  await p.fill("#lEmail", u.email);
  await p.fill("#lPass", u.password);
  await p.click('#loginF button[type="submit"]');
}

before(async () => {
  env = await testEnv();
  await env.clearFirestore();
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
  const uid = await authUser(OWNER);
  await authUser(OTHER);
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), "owners", uid), { note: "test owner" }));
  server = http.createServer((q, s) => {
    const f = join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/$/, "/index.html"));
    if (!f.startsWith(ROOT) || !existsSync(f)) { s.writeHead(404); return s.end(); }
    s.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); s.end(readFileSync(f));
  }).listen(0);
  base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); await env?.cleanup(); });

let trayRef, cateringRef;

test("customer order is saved in Firebase before 'Order received' shows", async () => {
  const p = await page();
  await fillCart(p, "Ana Reyes");
  await p.click("#sendBtn");
  await p.waitForSelector("text=Order received");
  trayRef = (await p.textContent(".ref")).trim();
  assert.match(trayRef, /^EU-[A-Z0-9]{6}$/);
  const o = await orderDoc(trayRef);
  assert.ok(o, "order exists in Firestore");
  assert.equal(o.status, "pending");
  assert.equal(o.name, "Ana Reyes");
  assert.equal(o.lines[0].name, "6-Tray Party Package");
  assert.equal(await p.textContent("#cartCount"), "0");
  await p.context().close();
});

test("rejected order shows an error and never says 'Order received'", async () => {
  const p = await page();
  const long = "X".repeat(130);
  await fillCart(p, long);
  await p.click("#sendBtn");
  await p.waitForFunction(() => document.querySelector("#rvErr").textContent.length > 0);
  assert.match(await p.textContent("#rvErr"), /couldn't accept/);
  assert.equal(await p.locator("text=Order received").count(), 0);
  assert.ok(p.url().endsWith("#review"));
  assert.equal((await allOrders()).filter((o) => o.name === long).length, 0);
  assert.equal(await p.textContent("#cartCount"), "1", "cart is kept so the customer can try again");
  await p.context().close();
});

test("no connection: error first, then one order (no duplicate) after retrying", async () => {
  const p = await page();
  await fillCart(p, "Offline Olivia");
  await p.context().setOffline(true);
  await p.click("#sendBtn");
  await p.waitForFunction(() => document.querySelector("#rvErr").textContent.length > 0, null, { timeout: 15000 });
  assert.match(await p.textContent("#rvErr"), /couldn't confirm/);
  assert.equal(await p.locator("text=Order received").count(), 0);
  await p.context().setOffline(false);
  await p.click("#sendBtn");
  await p.waitForSelector("text=Order received", { timeout: 20000 });
  assert.equal((await allOrders()).filter((o) => o.name === "Offline Olivia").length, 1);
  await p.context().close();
});

test("catering quotation request is saved before 'Quotation request received' shows", async () => {
  const p = await page();
  await p.goto(base + "/#catering");
  for (const v of ["Chicken Cordon Bleu", "Beef Steak", "Garlic Buttered Shrimp"]) await p.check(`input[name=catMain][value="${v}"]`);
  for (const v of ["Four Seasons", "Creamy Spaghetti"]) await p.check(`input[name=catSide][value="${v}"]`);
  await p.fill("#catVenue", "Almont Inland Resort, Butuan City");
  await p.fill("#catTheme", "Royal blue and gold");
  await p.fill("#catName", "Butuan Rotary Club");
  await p.fill("#catPhone", "0917 000 0004");
  await p.click("#catSend");
  await p.waitForSelector("text=Quotation request received");
  cateringRef = (await p.textContent(".ref")).trim();
  const o = await orderDoc(cateringRef);
  assert.equal(o.type, "catering");
  assert.equal(o.guests, 80);
  assert.deepEqual(o.sides, ["Four Seasons", "Creamy Spaghetti"]);
  await p.context().close();
});

test("wrong password and non-owner accounts cannot open the dashboard", async () => {
  const p = await page();
  await ownerSignIn(p, { email: OWNER.email, password: "wrong-password" });
  await p.waitForFunction(() => document.querySelector("#pinErr")?.textContent.includes("incorrect"));
  await ownerSignIn(p, OTHER);
  await p.waitForSelector("text=doesn't have owner access");
  assert.equal(await p.locator("#logout").count(), 0);
  assert.equal(await p.locator(`text=${trayRef}`).count(), 0);
  assert.equal(await p.locator("#pin").count(), 0, "demo PIN is gone");
  assert.ok(!(await p.content()).includes("Preview PIN"));
  await p.context().close();
});

test("owner signs in, sees phone orders live and can approve", async () => {
  const p = await page();
  await ownerSignIn(p);
  await p.waitForSelector("#logout");
  await p.waitForSelector(`[data-sel="${trayRef}"]`);
  await p.waitForSelector(`[data-sel="${cateringRef}"]`);
  // A new order from another phone appears without reloading.
  const phone = await page();
  await fillCart(phone, "Live Lito");
  await phone.click("#sendBtn");
  await phone.waitForSelector("text=Order received");
  const liveRef = (await phone.textContent(".ref")).trim();
  await phone.context().close();
  await p.waitForSelector(`[data-sel="${liveRef}"]`);
  // Approve the first order.
  await p.click(`[data-sel="${trayRef}"]`);
  await p.click('[data-act="approve"]');
  for (let i = 0; i < 50 && (await orderDoc(trayRef)).status !== "await"; i++) await new Promise((r) => setTimeout(r, 100));
  const o = await orderDoc(trayRef);
  assert.equal(o.status, "await");
  assert.equal(o.terms.final, 4999);
  assert.equal(o.terms.due, 2500);
  await p.waitForSelector("text=Copy this reply and send it");
  // Sign out locks the dashboard again.
  await p.click("#logout");
  await p.waitForSelector("#lEmail");
  await p.context().close();
});

test("owner menu price change shows on customers' phones", async () => {
  const p = await page();
  await ownerSignIn(p);
  await p.waitForSelector("#logout");
  await p.click('[data-otab="menu"]');
  const input = p.locator('[data-mp="p4999|price"]');
  await input.fill("4799");
  await input.dispatchEvent("change");
  await p.waitForSelector("text=Price saved");
  const c = await page();
  await c.goto(base + "/#trays");
  await c.waitForSelector("text=₱4,799");
  await c.context().close();
  await p.context().close();
});

test("before Firebase is set up, the site says so and never claims an order was received", async () => {
  const p = await page({ live: false });
  await fillCart(p, "Not Yet");
  assert.ok(await p.isVisible("#offlineNote"));
  await p.click("#sendBtn");
  await p.waitForFunction(() => document.querySelector("#rvErr").textContent.includes("isn't connected yet"));
  assert.equal(await p.locator("text=Order received").count(), 0);
  await p.goto(base + "/#owner");
  await p.waitForSelector("text=Not connected yet");
  await p.context().close();
});

test("no JavaScript errors on any page", () => { assert.deepEqual(pageErrors, []); });
