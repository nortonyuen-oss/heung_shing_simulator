// Original vector artwork for the player's Bauhinia collection. No external assets/fonts.
(function (root) {
  'use strict';
  const palettes = {
    bronze: ['#ffe0b0', '#bc7950', '#663b29', '#8c4f61', '#e9b7a4'],
    silver: ['#f4f8ff', '#a7b9cc', '#4c6076', '#6c648d', '#e1dcf2'],
    gold: ['#fff0b4', '#d7ac57', '#795321', '#935776', '#f5d6e5'],
    bauhinia: ['#f9e7b7', '#c4a46c', '#716044', '#9b5889', '#f8e0f0'],
    black: ['#d5c3e8', '#6f5a83', '#241d32', '#34223f', '#c4a4d8'],
    memorial: ['#ede4ff', '#b39ad7', '#574573', '#7972ac', '#f2e8ff'],
    grand: ['#fff4bf', '#e2bb60', '#8b5829', '#8e3c6a', '#ffe4f0'],
    secret: ['#9aaabb', '#607185', '#303d4e', '#3d485c', '#9babbc'],
  };
  let serial = 0;

  function renderBauhiniaMedalSvg(tier = 'bauhinia', concealed = false) {
    const key = concealed ? 'secret' : Object.hasOwn(palettes, tier) ? tier : 'bauhinia';
    const [light, mid, dark, enamel, petal] = palettes[key];
    const id = `bauhinia-${++serial}`;
    const leaves = Array.from({ length: 7 }, (_, i) => {
      const y = 147 - i * 8, x = 61 - Math.sin(i / 6 * Math.PI) * 8;
      return `<ellipse cx="${x}" cy="${y}" rx="3.3" ry="7" transform="rotate(${-42 + i * 9} ${x} ${y})"/>`;
    }).join('');
    const flower = key === 'secret'
      ? `<path d="M91 91c0-13 20-16 20-2 0 8-11 9-11 18" fill="none" stroke="${light}" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="118" r="3" fill="${light}"/>`
      : Array.from({ length: 5 }, (_, i) => `<g transform="rotate(${i * 72} 100 103)"><path d="M100 103C88 95 78 77 86 65c5-7 12-8 16-2 6-5 14-1 15 6 3 15-7 27-17 34Z" fill="url(#${id}-petal)" stroke="${light}" stroke-width="1.15"/><path d="M100 99c-5-10-7-19-3-28" fill="none" stroke="${mid}" stroke-width="1.2" opacity=".85"/><path d="m98 78 1.8 3.5 3.9.6-2.8 2.8.7 3.9-3.6-1.9-3.5 1.9.6-3.9-2.8-2.8 3.9-.6Z" fill="${enamel}"/></g>`).join('')
        + `<circle cx="100" cy="103" r="5" fill="${light}"/><circle cx="100" cy="103" r="2" fill="${enamel}"/>`;
    const rays = key === 'grand' ? `<g fill="url(#${id}-metal)">${Array.from({ length: 12 }, (_, i) => `<path d="m100 19 5 24h-10Z" transform="rotate(${i * 30} 100 103)"/>`).join('')}</g>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 214" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="${id}-metal" x1="48" y1="42" x2="151" y2="162" gradientUnits="userSpaceOnUse"><stop stop-color="${mid}"/><stop offset=".27" stop-color="${light}"/><stop offset=".51" stop-color="${mid}"/><stop offset=".76" stop-color="${dark}"/><stop offset="1" stop-color="${light}"/></linearGradient>
        <linearGradient id="${id}-ribbon" x1="65" y1="130" x2="131" y2="200" gradientUnits="userSpaceOnUse"><stop stop-color="#754b76"/><stop offset=".5" stop-color="#4f2b57"/><stop offset="1" stop-color="#30223e"/></linearGradient>
        <radialGradient id="${id}-enamel" cx=".4" cy=".3" r=".8"><stop stop-color="${enamel}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
        <linearGradient id="${id}-petal" x1="86" y1="65" x2="112" y2="104" gradientUnits="userSpaceOnUse"><stop stop-color="#fffdf5"/><stop offset=".62" stop-color="${petal}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
      </defs>
      <ellipse cx="100" cy="198" rx="48" ry="5" fill="#000" opacity=".16"/>
      <path d="m68 131-14 65 25-10 15 17 12-64M107 139l13 64 14-17 25 10-24-65" fill="url(#${id}-ribbon)" stroke="${mid}" stroke-width="1.5"/>
      <path d="m72 148-10 37m19-34-9 32m52-32 9 32m0-35 14 37" stroke="${light}" stroke-width="2" opacity=".65"/>
      ${rays}
      <path d="M91 37v-9c0-13 18-13 18 0v9" stroke="url(#${id}-metal)" stroke-width="5"/>
      <circle cx="100" cy="103" r="69" fill="#060b13" opacity=".25" transform="translate(0 3)"/>
      <circle cx="100" cy="103" r="68" fill="url(#${id}-metal)"/>
      <circle cx="100" cy="103" r="62.5" stroke="${dark}" stroke-width="1"/>
      <circle cx="100" cy="103" r="59.5" fill="url(#${id}-enamel)" stroke="${light}" stroke-width="1.5"/>
      <circle cx="100" cy="103" r="55" stroke="${light}" stroke-width=".7" stroke-dasharray="1 4" opacity=".55"/>
      <g fill="${mid}" opacity=".8">${leaves}<g transform="translate(200 0) scale(-1 1)">${leaves}</g></g>
      <path d="M67 149q33 18 66 0" stroke="${light}" stroke-width="1" opacity=".7"/>
      ${flower}
      <path d="m100 144 2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8Z" fill="${light}"/>
      <path d="M48 84a55 55 0 0 1 37-35" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".28"/>
    </svg>`;
  }
  root.renderBauhiniaMedalSvg = renderBauhiniaMedalSvg;
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderBauhiniaMedalSvg };
})(typeof globalThis !== 'undefined' ? globalThis : this);
