// Title screen dressing: a troupe of wobbly characters (inline SVG) that
// bounce, wave and wobble behind the logo, plus the controller chips.
import { PLAYER_COLORS, PLAYER_CSS } from './config.js';

const shade = (c, k) => {
  const r = Math.min(255, ((c >> 16) & 255) * k) | 0, g = Math.min(255, ((c >> 8) & 255) * k) | 0, b = Math.min(255, (c & 255) * k) | 0;
  return `rgb(${r},${g},${b})`;
};

function hatSVG(kind, col) {
  switch (kind) {
    case 'cap': return `<path d="M-30 -92 Q0 -128 30 -92 Z" fill="${col}"/><path d="M6 -94 Q38 -98 44 -90 L8 -88 Z" fill="${col}"/>`;
    case 'tophat': return `<rect x="-36" y="-100" width="72" height="8" rx="4" fill="#222"/><rect x="-22" y="-142" width="44" height="44" rx="5" fill="#222"/><rect x="-22" y="-108" width="44" height="8" fill="${col}"/>`;
    case 'crown': return `<path d="M-24 -96 L-26 -126 L-12 -110 L0 -130 L12 -110 L26 -126 L24 -96 Z" fill="#ffd23f" stroke="#e0a800" stroke-width="3"/><circle cx="0" cy="-104" r="4" fill="#ff3355"/>`;
    case 'party': return `<path d="M-18 -98 L4 -150 L20 -98 Z" fill="${col}"/><path d="M-12 -112 L14 -112 M-6 -126 L10 -126" stroke="#fff" stroke-width="5"/><circle cx="4" cy="-152" r="7" fill="#fff"/>`;
    case 'beanie': return `<path d="M-31 -90 Q0 -132 31 -90 Z" fill="${col}"/><rect x="-32" y="-96" width="64" height="10" rx="5" fill="${shade(0xffffff, 0.92)}"/><circle cy="-122" r="8" fill="#fff"/>`;
    case 'cowboy': return `<ellipse cy="-94" rx="50" ry="8" fill="#9a6232"/><path d="M-24 -96 Q-24 -128 0 -124 Q24 -128 24 -96 Z" fill="#9a6232"/><rect x="-24" y="-102" width="48" height="6" fill="#4a2a12"/>`;
    default: return '';
  }
}

// One character, ~120 x 230 units, feet at y = 0.
export function characterSVG(color, hat, i) {
  const c = PLAYER_CSS(color), dark = shade(color, 0.55), skin = '#ffd9b8';
  const blink = `<animate attributeName="ry" values="9;9;1;9" keyTimes="0;0.93;0.96;1" dur="${3 + (i % 3)}s" repeatCount="indefinite"/>`;
  return `<svg class="tchar" viewBox="-70 -190 140 200" style="--d:${(i * 0.37) % 1.7}s;--s:${0.85 + (i % 3) * 0.08}">
    <ellipse class="tshadow" cx="0" cy="2" rx="34" ry="7" fill="rgba(0,0,0,.18)"/>
    <g class="tbody">
      <rect x="-22" y="-34" width="18" height="34" rx="9" fill="${dark}"/><rect x="4" y="-34" width="18" height="34" rx="9" fill="${dark}"/>
      <ellipse cx="-13" cy="-2" rx="14" ry="7" fill="#3a3340"/><ellipse cx="13" cy="-2" rx="14" ry="7" fill="#3a3340"/>
      <rect x="-30" y="-80" width="60" height="56" rx="28" fill="${c}"/>
      <circle cx="0" cy="-58" r="3.5" fill="#fff"/><circle cx="0" cy="-44" r="3" fill="#fff"/>
      <g class="tarm tarmL"><rect x="-38" y="-78" width="13" height="40" rx="6.5" fill="${c}"/><circle cx="-31.5" cy="-38" r="9" fill="#fff"/></g>
      <g class="tarm tarmR"><rect x="25" y="-78" width="13" height="40" rx="6.5" fill="${c}"/><circle cx="31.5" cy="-38" r="9" fill="#fff"/></g>
      <g class="thead">
        <circle cx="0" cy="-102" r="32" fill="${skin}"/>
        <ellipse cx="-11" cy="-104" rx="6.5" ry="9" fill="#fff"/><ellipse cx="11" cy="-104" rx="6.5" ry="9" fill="#fff"/>
        <ellipse cx="-10" cy="-103" rx="4" ry="6" fill="#1c1c28">${blink}</ellipse><ellipse cx="12" cy="-103" rx="4" ry="6" fill="#1c1c28">${blink}</ellipse>
        <ellipse cx="-21" cy="-92" rx="6" ry="3.5" fill="rgba(255,120,120,.45)"/><ellipse cx="21" cy="-92" rx="6" ry="3.5" fill="rgba(255,120,120,.45)"/>
        <path d="M-8 -90 Q0 -82 8 -90" stroke="#5a2a2a" stroke-width="3" fill="none" stroke-linecap="round"/>
        <g transform="translate(0,-24)">${hatSVG(hat, c)}</g>
      </g>
    </g></svg>`;
}

const HATS = ['cap', 'party', 'tophat', 'beanie', 'crown', 'cowboy', 'none', 'cap'];

export function buildTitleCrowd(el) {
  const anims = ['hop', 'wave', 'wobble', 'hop', 'dance', 'wave', 'wobble', 'dance'];
  el.innerHTML = PLAYER_COLORS.slice(0, 8).map((col, i) =>
    `<div class="tslot a-${anims[i]}">${characterSVG(col, HATS[i], i)}</div>`).join('');
}
