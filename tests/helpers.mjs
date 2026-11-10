import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PROJECT = "demo-eurika";

export function testEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(ROOT + "firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
}

// Exactly what the website sends for a party tray order (created is a server timestamp).
export function trayOrder(ref, serverTimestamp) {
  return {
    ref, type: "order", created: serverTimestamp(), name: "Ana Reyes", phone: "0917 123 4567",
    date: "2026-12-20", time: "10:00", method: "Personal pickup", address: "", notes: "",
    lines: [{ pid: "p4299a", name: "4-Tray Package A", detail: "25 pax · Medium trays", unit: 4299, qty: 1, promo: true }],
    est: 4299, promo: true, status: "pending", terms: {}, cal: { state: "none" },
    msg: { summary: "waiting", payment: "none" }, hist: ["Order submitted on the website"],
  };
}

export function cateringRequest(ref, serverTimestamp) {
  return {
    ref, type: "catering", created: serverTimestamp(), name: "Butuan Rotary Club", phone: "0917 000 0004",
    date: "2026-12-28", time: "18:00", method: "Catering", address: "Almont Inland Resort, Butuan City", notes: "",
    theme: "Royal blue and gold", fb: "Butuan Rotary", email: "", alt: "", altPhone: "", guests: 80, pkg: "c300",
    mains: ["Chicken Cordon Bleu", "Beef Steak", "Garlic Buttered Shrimp"], sides: ["Four Seasons", "Creamy Spaghetti"],
    dessert: "Mango Pandan & Gulaman", lines: [], est: 24000, promo: false, status: "pending", terms: {},
    cal: { state: "none" }, msg: { summary: "waiting", payment: "none" }, hist: ["Quotation request submitted"],
  };
}
