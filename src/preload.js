// Boot loading: every image (and the UI font) registers here, so the title
// screen can wait behind a loading bar instead of flashing its stand-in
// drawings while the real art streams in. Failed loads count as done (the
// game still has its procedural fallbacks for those).

const items = [];

// an <img> whose src is already set
export function track(img) {
  const it = { done: false };
  const fin = () => { it.done = true; };
  if (img.complete) fin();
  else { img.addEventListener('load', fin, { once: true }); img.addEventListener('error', fin, { once: true }); }
  items.push(it);
  return img;
}

// any promise (e.g. document.fonts.load)
export function trackPromise(p) {
  const it = { done: false };
  Promise.resolve(p).finally(() => { it.done = true; });
  items.push(it);
}

// 0..1
export function loadProgress() {
  if (!items.length) return 1;
  let n = 0;
  for (const it of items) if (it.done) n++;
  return n / items.length;
}
