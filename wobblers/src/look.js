// Global shading tweaks for the toy-like Wobbly Life look. Imported once
// before any material compiles; it patches three's Lambert shader so every
// Lambert material (world, players, vehicles, props) gets:
//  - wrapped diffuse: light bleeds softly round the terminator, so shapes
//    read as soft plastic instead of hard-shaded polygons;
//  - a faint sky-coloured rim on the sides of things, which separates
//    characters and props from the background (strongest on vertical faces,
//    none on flat ground so far-off fields don't wash out).
// The rim takes its colour from the first hemisphere light, so it follows the
// day/night cycle with no extra uniforms.
import * as THREE from 'three';

const WRAP = 0.42;     // 0 = plain Lambert
const RIM = 0.3;

const pars = THREE.ShaderChunk.lights_lambert_pars_fragment;
const plain = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
if (pars.includes(plain)) {
  THREE.ShaderChunk.lights_lambert_pars_fragment = pars.replace(plain,
    `float dotNL = saturate( ( dot( geometryNormal, directLight.direction ) + ${WRAP.toFixed(3)} ) / ${(1 + WRAP).toFixed(3)} );
	dotNL = dotNL * dotNL * ( 3.0 - 2.0 * dotNL ) * 0.35 + dotNL * 0.65;`);
}

const frag = THREE.ShaderLib.lambert.fragmentShader;
const anchor = '#include <opaque_fragment>';
if (frag.includes(anchor) && !frag.includes('wobRim')) {
  THREE.ShaderLib.lambert.fragmentShader = frag.replace(anchor, `
	#if NUM_HEMI_LIGHTS > 0
	{ // wobRim
		vec3 vdir = normalize( vViewPosition );
		vec3 upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
		float side = 1.0 - abs( dot( normal, upV ) );
		float rim = pow( 1.0 - saturate( dot( normal, vdir ) ), 3.0 ) * side;
		outgoingLight += hemisphereLights[ 0 ].skyColor * rim * ${RIM.toFixed(3)} * ( 0.35 + 0.65 * diffuseColor.rgb );
	}
	#endif
	${anchor}`);
}

// Night glow for vertex-coloured static meshes: the Builder writes a `glow`
// attribute (lit windows, lamp globes); this adds it as emission scaled by
// `glowUniform.value` (0 by day, 1 at night).
export const glowUniform = { value: 0 };
export function addGlow(material) {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glowUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
	if ( vGlow > 0.0 ) {
		vec3 warm = vGlow > 1.5 ? vec3( 1.0, 0.9, 0.6 ) * 2.2 : vec3( 1.0, 0.45, 0.08 ) * 0.85;
		totalEmissiveRadiance += warm * uGlow * min( vGlow, 1.0 );
		diffuseColor.rgb *= 1.0 - 0.9 * uGlow;
	}`);
  };
  material.customProgramCacheKey = () => 'wobGlow';
  return material;
}
