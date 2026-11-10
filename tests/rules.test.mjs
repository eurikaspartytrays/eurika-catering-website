// Security rules tests: customers can submit, but cannot read or change any order.
import { test, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp, query, where } from "firebase/firestore";
import { testEnv, trayOrder, cateringRequest } from "./helpers.mjs";

let env;
const OWNER = "owner-uid", STRANGER = "someone-else";
before(async () => { env = await testEnv(); });
after(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, "owners", OWNER), { note: "Eurika" });
    await setDoc(doc(db, "orders", "EU-EXIST1"), trayOrder("EU-EXIST1", serverTimestamp));
    await setDoc(doc(db, "config", "site"), { settings: { lead: 24 } });
  });
});
const customer = () => env.unauthenticatedContext().firestore();
const stranger = () => env.authenticatedContext(STRANGER, { email: "x@example.com" }).firestore();
const owner = () => env.authenticatedContext(OWNER, { email: "owner@example.com" }).firestore();

test("customer can submit a party tray order", async () => {
  await assertSucceeds(setDoc(doc(customer(), "orders", "EU-ABC234"), trayOrder("EU-ABC234", serverTimestamp)));
});
test("customer can submit a catering quotation request", async () => {
  await assertSucceeds(setDoc(doc(customer(), "orders", "EU-CAT234"), cateringRequest("EU-CAT234", serverTimestamp)));
});
test("customer cannot read an order, even knowing its reference", async () => {
  await assertFails(getDoc(doc(customer(), "orders", "EU-EXIST1")));
});
test("customer cannot read the order they just submitted", async () => {
  const db = customer();
  await assertSucceeds(setDoc(doc(db, "orders", "EU-MINE23"), trayOrder("EU-MINE23", serverTimestamp)));
  await assertFails(getDoc(doc(db, "orders", "EU-MINE23")));
});
test("customer cannot list or search orders", async () => {
  await assertFails(getDocs(collection(customer(), "orders")));
  await assertFails(getDocs(query(collection(customer(), "orders"), where("phone", "==", "0917 123 4567"))));
});
test("customer cannot change, overwrite or delete an order", async () => {
  const db = customer();
  await assertFails(updateDoc(doc(db, "orders", "EU-EXIST1"), { status: "reserved" }));
  await assertFails(setDoc(doc(db, "orders", "EU-EXIST1"), trayOrder("EU-EXIST1", serverTimestamp)));
  await assertFails(deleteDoc(doc(db, "orders", "EU-EXIST1")));
});
test("customer cannot submit an order that is already approved, reserved or priced", async () => {
  const db = customer();
  const bad = [
    { status: "reserved" }, { status: "await" },
    { terms: { final: 1, due: 1 } }, { msg: { summary: "linked", payment: "sent" } },
    { hist: ["Order submitted", "Payment verified"] }, { extra: "field" },
    { name: "" }, { name: "x".repeat(121) }, { lines: [] }, { est: -5 }, { date: "next week" },
  ];
  for (const [i, patch] of bad.entries()) {
    const ref = "EU-BAD" + String(i).padStart(3, "0");
    await assertFails(setDoc(doc(db, "orders", ref), { ...trayOrder(ref, serverTimestamp), ...patch }));
  }
  await assertFails(setDoc(doc(db, "orders", "EU-WRONG1"), trayOrder("EU-OTHER1", serverTimestamp)));
  await assertFails(setDoc(doc(db, "orders", "random-id"), trayOrder("random-id", serverTimestamp)));
  await assertFails(setDoc(doc(db, "orders", "EU-TIME01"), { ...trayOrder("EU-TIME01", serverTimestamp), created: new Date(2020, 0, 1) }));
  await assertFails(setDoc(doc(db, "orders", "EU-FEWG01"), { ...cateringRequest("EU-FEWG01", serverTimestamp), guests: 10 }));
});
test("a signed-in account that is not an owner cannot read or change orders", async () => {
  const db = stranger();
  await assertFails(getDoc(doc(db, "orders", "EU-EXIST1")));
  await assertFails(getDocs(collection(db, "orders")));
  await assertFails(updateDoc(doc(db, "orders", "EU-EXIST1"), { status: "cancel" }));
  await assertFails(setDoc(doc(db, "owners", STRANGER), { me: true }));
  await assertFails(getDocs(collection(db, "owners")));
  await assertFails(setDoc(doc(db, "config", "site"), { settings: { lead: 0 } }));
});
test("only the owner can read and manage orders", async () => {
  const db = owner();
  await assertSucceeds(getDocs(collection(db, "orders")));
  await assertSucceeds(updateDoc(doc(db, "orders", "EU-EXIST1"), { status: "await", "msg.payment": "manual" }));
  await assertSucceeds(getDoc(doc(db, "owners", OWNER)));
});
test("everyone can read menu settings, only the owner can change them", async () => {
  await assertSucceeds(getDoc(doc(customer(), "config", "site")));
  await assertFails(setDoc(doc(customer(), "config", "site"), { menu: { p4999: { price: 1 } } }, { merge: true }));
  await assertSucceeds(setDoc(doc(owner(), "config", "site"), { menu: { p4999: { price: 4799 } } }, { merge: true }));
});
test("anything else is denied", async () => {
  await assertFails(setDoc(doc(customer(), "anything", "x"), { a: 1 }));
  await assertFails(getDoc(doc(stranger(), "anything", "x")));
});
