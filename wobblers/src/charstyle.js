// Character look styles, to compare options: the same ragdoll (physics is
// untouched) drawn with different proportions and shading. Pick one with
// ?style=<id> in the URL (e.g. /wobblers/?style=toon); the default is CLASSIC.
//   head:  head size;          drop:  head sunk into the body (unscaled m)
//   limb:  arm / leg thickness; hand / shoe: mitten / shoe size
//   body:  torso width;        mat: 'phong' | 'matte' | 'vinyl' | 'toon'
//   outline: dark inverted-hull outline (cel look)
import * as THREE from 'three';

export const CHAR_STYLES = {
  classic: { name: 'Classic (current)', head: 1, drop: 0, limb: 1, hand: 1, shoe: 1, body: 1, mat: 'phong' },
  chunky: { name: 'Chunky toy', head: 1.18, drop: 0.04, limb: 1.4, hand: 1.22, shoe: 1.18, body: 1.07, mat: 'matte' },
  vinyl: { name: 'Vinyl figure', head: 1.12, drop: 0.02, limb: 1.15, hand: 1.1, shoe: 1.08, body: 1, mat: 'vinyl' },
  toon: { name: 'Cel toon', head: 1.05, drop: 0, limb: 1.12, hand: 1.05, shoe: 1.05, body: 1, mat: 'toon', outline: true },
  blob: { name: 'Wobbly blob', head: 1.3, drop: 0.13, limb: 1.3, hand: 1.12, shoe: 1.12, body: 1.16, mat: 'matte' },
  chibi: { name: 'Big-head chibi', head: 1.42, drop: 0.07, limb: 1.2, hand: 1.15, shoe: 1.15, body: 0.94, mat: 'vinyl' },
};

const param = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('style') : null;
export const STYLE_ID = CHAR_STYLES[param] ? param : 'chunky';
export const STYLE = CHAR_STYLES[STYLE_ID];
// How flat the face side of the head is (0 = round ball; ?flat=0.5 to try other values).
const flatParam = typeof location !== 'undefined' ? parseFloat(new URLSearchParams(location.search).get('flat')) : NaN;
export const FACE_FLAT = Number.isFinite(flatParam) ? flatParam : STYLE.faceFlat || 0;

let _ramp = null;
const toonRamp = () => {
  if (!_ramp) {
    _ramp = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
    _ramp.minFilter = _ramp.magFilter = THREE.NearestFilter;
    _ramp.needsUpdate = true;
  }
  return _ramp;
};

// A character material in the current style (vertex colours or a face map).
export function charMat(opts = {}) {
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
