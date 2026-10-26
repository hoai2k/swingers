// Character look styles, to compare options: the same ragdoll (physics is
// untouched) drawn with different proportions and shading. Pick one with
// ?style=<id> in the URL (e.g. /wobblers/?style=toon); the default is CLASSIC.
//   head:  head size;          drop:  head sunk into the body (unscaled m)
//   limb:  arm / leg thickness; hand / shoe: mitten / shoe size
//   body:  torso width;        mat: 'phong' | 'matte' | 'vinyl' | 'toon'
//   outline: dark inverted-hull outline (cel look)
import * as THREE from 'three';
import { settings } from './settings.js';

export const CHAR_STYLES = {
  classic: { name: 'Classic (current)', head: 1, drop: 0, limb: 1, hand: 1, shoe: 1, body: 1, mat: 'phong' },
  chunky: { name: 'Chunky toy', head: 1.0, drop: 0.03, limb: 1.4, hand: 1.22, shoe: 1.18, body: 1.07, mat: 'matte', faceFlat: 0.5 },
  vinyl: { name: 'Vinyl figure', head: 1.12, drop: 0.02, limb: 1.15, hand: 1.1, shoe: 1.08, body: 1, mat: 'vinyl' },
  toon: { name: 'Cel toon', head: 1.05, drop: 0, limb: 1.12, hand: 1.05, shoe: 1.05, body: 1, mat: 'toon', outline: true },
  blob: { name: 'Wobbly blob', head: 1.3, drop: 0.13, limb: 1.3, hand: 1.12, shoe: 1.12, body: 1.16, mat: 'matte' },
  // one colour all over (head and hands too), two black oval eyes, blue shoes, big round head low on a pear body
  wobbly: { name: 'Wobbly Life-like', head: 1.24, drop: 0.1, limb: 1.4, hand: 1.08, shoe: 1.15, body: 1.12, mat: 'matte', mono: true },
  // Wobbly Life proportions and coloured skin, but our head, faces and clothes: a smooth
  // rounded body in the skin colour with the shirt and trousers as layers on top
  dressed: { name: 'Dressed wobbly', head: 1.24, drop: 0.1, limb: 1.4, hand: 1.08, shoe: 1.15, body: 1.12, mat: 'matte', faceFlat: 0.5, layered: true, skinColored: true },
  chibi: { name: 'Big-head chibi', head: 1.42, drop: 0.07, limb: 1.2, hand: 1.15, shoe: 1.15, body: 0.94, mat: 'vinyl' },
};

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const param = q.get('style'), headParam = parseFloat(q.get('head')), flatParam = parseFloat(q.get('flat'));
// The live style (ES live bindings: importers see a change). Settings > Toy style characters
// switches between 'chunky' and 'dressed' at runtime (game.setCharStyle); ?style= wins.
export let STYLE_ID, STYLE, FACE_FLAT;
export function setCharStyle(id) {
  STYLE_ID = CHAR_STYLES[id] ? id : 'chunky';
  // ?head=0.85 scales the style's head (to try other head sizes)
  STYLE = Number.isFinite(headParam) ? { ...CHAR_STYLES[STYLE_ID], head: CHAR_STYLES[STYLE_ID].head * headParam } : CHAR_STYLES[STYLE_ID];
  // How flat the face side of the head is (0 = round ball; ?flat=0.5 to try other values).
  FACE_FLAT = Number.isFinite(flatParam) ? flatParam : STYLE.faceFlat || 0;
}
export const TOY_STYLE = 'dressed';

// Toy style: the skin tone for a character colour: the same hue, a little softer and with
// its lightness pulled into a skin-like middle band, so very dark / pale / neon picks still
// read as skin (the clothes keep the full colour).
const _hsl = {}, _sc = new THREE.Color();
export function skinTone(hex) {
  _sc.set(hex).getHSL(_hsl);
  const s = Math.min(_hsl.s, 0.85) * 0.95, l = 0.58 + (Math.max(0.3, Math.min(0.85, _hsl.l)) - 0.58) * 0.45;
  return _sc.setHSL(_hsl.h, s, l).getHex();
}
setCharStyle(CHAR_STYLES[param] ? param : settings.toyStyle ? TOY_STYLE : 'chunky');

let _ramp = null;
const toonRamp = () => {
  if (!_ramp) {
    _ramp = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
    _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
    _ramp.needsUpdate = true;
  }
  return _ramp;
};

// Peach face backgrounds (#ffd9b8, linear) are recoloured to the character's skin colour
// in styles with coloured skin: the head mesh sets material.userData.skinU before it draws.
function skinSwap(m) {
  const skinU = m.userData.skinU = { value: new THREE.Color(0xffd9b8) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSkin = skinU;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSkin;')
      .replace('#include <map_fragment>', `#include <map_fragment>
	{
		float k = smoothstep(0.05, 0.22, length(diffuseColor.rgb - vec3(1.0, 0.693, 0.479)));
		diffuseColor.rgb = mix(uSkin, diffuseColor.rgb, k);
	}`);
  };
  m.customProgramCacheKey = () => 'wobSkinSwap' + STYLE.mat;
  return m;
}

// A character material in the current style (vertex colours or a face map).
export function charMat(opts = {}) {
  const m = charMatBase(opts);
  return opts.map && STYLE.skinColored ? skinSwap(m) : m;
}
function charMatBase(opts) {
  switch (STYLE.mat) {
    case 'matte': return new THREE.MeshStandardMaterial({ ...opts, roughness: 0.82, metalness: 0 });
    case 'vinyl': return new THREE.MeshPhysicalMaterial({ ...opts, roughness: 0.42, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: 0xffffff, sheenRoughness: 0.6 });
    case 'toon': return new THREE.MeshToonMaterial({ ...opts, gradientMap: toonRamp() });
    default: return new THREE.MeshPhongMaterial({ ...opts, shininess: 24, specular: 0x2a2a2a });
  }
}

// Outline for the cel style: the back faces pushed out along the normals.
let _outline = null;
export function outlineMat() {
  if (!_outline) {
    _outline = new THREE.MeshBasicMaterial({ color: 0x23202a, side: THREE.BackSide });
    _outline.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n#ifdef USE_SKINNING\n\ttransformed += normalize( objectNormal ) * 0.014;\n#endif');
    };
    _outline.customProgramCacheKey = () => 'wobOutline';
  }
  return _outline;
}
