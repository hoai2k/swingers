// Boot loading: every image registers here so the start screen waits behind
// a loading bar instead of showing stand-in drawings. Failed loads count as
// done (everything has a procedural fallback).

const items = [];
export function track(img) {
  const it = { done: false };
  const fin = () => { it.done = true; };
  if (img.complete) fin();
  else { img.addEventListener('load', fin, { once: true }); img.addEventListener('error', fin, { once: true }); }
  items.push(it);
  return img;
}
export function trackPromise(p) {
  const it = { done: false };
  Promise.resolve(p).finally(() => { it.done = true; });
  items.push(it);
}
export function loadProgress() {
  if (!items.length) return 1;
  let n = 0;
  for (const it of items) if (it.done) n++;
  return n / items.length;
}

// Load an optional image; returns the <img>. ready(img) tells if usable.
export function loadImage(src, { tracked = true } = {}) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  if (tracked) track(img);
  return img;
}
export const ready = (img) => !!(img && img.complete && img.naturalWidth);
