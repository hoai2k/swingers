// Delivered art (see image-requests.md). assets/manifest.json lists the image files
// that exist; they are preloaded at boot so screens never show a stand-in first, and
// nothing requests a file that isn't there. Add a path to the manifest when an image
// arrives.
const ready = new Set();

export async function loadAssets(progress) {
  let files = [];
  try {
    const r = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (r.ok) files = (await r.json()).files || [];
  } catch { /* no manifest: run on fallbacks */ }
  let done = 0;
  await Promise.all(files.map((f) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { ready.add(f); res(); };
    img.onerror = () => { console.warn('missing asset', f); res(); };
    img.src = f;
  }).then(() => progress?.(++done, files.length))));
}

export const hasAsset = (path) => ready.has(path);
