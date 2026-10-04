// normalizeText() is pure local text processing, so these tests are the real thing, not stubs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "../dist/index.js";

// What scraping does: UTF-8 bytes decoded as Latin-1 (C1 controls) ...
const latin1 = (s) => Buffer.from(s, "utf8").toString("latin1");
// ... or as Windows-1252 (the usual browser/Excel default).
const CP1252 = { 0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰", 0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•", 0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ" };
const cp1252 = (s) => [...Buffer.from(s, "utf8")].map((b) => CP1252[b] ?? String.fromCharCode(b)).join("");

const yoruba = "Ọmọ mi, ṣé o ti jẹun? Ẹ kú àárọ̀.";
const hausa = "Ƙasar Najeriya tana da ɗimbin al'umma; ɓarna ba ta da kyau.";
const igbo = "Ị nọ n'ụlọ akwụkwọ? Anyị na-asụ Igbo.";

test("repairs UTF-8 mis-decoded as Windows-1252 (all three languages)", () => {
  for (const s of [yoruba, hausa, igbo]) {
    assert.notEqual(cp1252(s), s);
    assert.equal(normalizeText(cp1252(s)), s.normalize("NFC"));
  }
});

test("repairs UTF-8 mis-decoded as Latin-1", () => {
  for (const s of [yoruba, hausa, igbo]) assert.equal(normalizeText(latin1(s)), s.normalize("NFC"));
});

test("leaves correct text unchanged (idempotent)", () => {
  for (const s of [yoruba, hausa, igbo, "Où est l'hôpital? Größe, naïve, café"]) {
    assert.equal(normalizeText(s), s.normalize("NFC"));
    assert.equal(normalizeText(normalizeText(s, { language: "yo" }), { language: "yo" }), normalizeText(s, { language: "yo" }));
  }
});

test("Yoruba: cedilla/ogonek stand-ins become dot-below, tone marks kept", () => {
  assert.equal(normalizeText("Şé o ti jęun? Ǫmǫ", { language: "yo" }), "Ṣé o ti jẹun? Ọmọ");
  // "ę" with an acute tone mark typed as e + ogonek + acute
  assert.equal(normalizeText("ję́", { language: "yo" }), "jẹ́");
  // Without a language these letters are left alone (they are legitimate in other languages).
  assert.equal(normalizeText("Şé"), "Şé");
});

test("Igbo: ogonek stand-ins become dot-below", () => {
  assert.equal(normalizeText("į nǫ n'ųlǫ", { language: "ig" }), "ị nọ n'ụlọ");
});

test("Hausa: look-alike letters become hooked letters", () => {
  assert.equal(normalizeText("ķasa ɖaya ƃarna Ķano", { language: "ha" }), "ƙasa ɗaya ɓarna Ƙano");
});

test("Hausa apostrophe conventions are opt-in", () => {
  const typed = "k'asa d'aya 'bata, al'umma, 'ya'ya";
  assert.equal(normalizeText(typed, { language: "ha" }), typed);
  assert.equal(normalizeText(typed, { language: "ha", hausaApostrophes: true }), "ƙasa ɗaya ɓata, al'umma, 'ya'ya");
});

test("removes invisible characters and composes to NFC", () => {
  const decomposed = "Ọmọ​ mi﻿";
  assert.equal(normalizeText(decomposed), "Ọmọ mi");
  assert.equal(normalizeText("a b"), "a b");
});

test("does not invent missing tone marks (documented boundary)", () => {
  assert.equal(normalizeText("Omo mi, se o ti jeun?", { language: "yo" }), "Omo mi, se o ti jeun?");
});
