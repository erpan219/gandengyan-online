'use strict';
/* Small, local vector portraits. All artwork is decorative: the adjacent name
 * supplies the accessible identity. No user text is interpolated into SVG. */
function avatarPortrait(name, isBot) {
  let seed = 0;
  for (const char of String(name || 'Player')) seed = (Math.imul(seed, 31) + char.codePointAt(0)) >>> 0;
  const animals = { 'Lucky Cat': 'cat', 'Panda Bingo': 'panda', 'Tea Egg Tiger': 'tiger',
    'Sesame Bunny': 'rabbit', 'Dumpling Dragon': 'dragon', 'Uncle Long': 'dragon', 'Mooncake Moose': 'deer' };
  const animal = isBot && animals[name];
  const palette = [
    ['#173e36', '#286053', '#a32932'], ['#59242b', '#81343a', '#1c5547'],
    ['#243e50', '#3d5967', '#913c34'], ['#45324c', '#654866', '#295848'],
  ][seed % 4];
  const ink = '#322722', gold = '#ebc66f', cream = '#fff0c9';
  // Unique paint IDs keep multiple copies of a named portrait independent.
  const id = 'portrait-' + (++avatarPortrait.serial);
  const eyes = `<path d="M24 32.5h.1m15.8 0h.1" fill="none" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M29 40q3 2.5 6 0" fill="none" stroke="${ink}" stroke-width="1.5" stroke-linecap="round"/>`;
  let figure;
  if (animal) {
    const fur = animal === 'panda' ? '#f4e9d1' : animal === 'tiger' ? '#e7ab50' : animal === 'dragon' ? '#7eae88' : animal === 'rabbit' ? '#f4dfc3' : '#dba679';
    let ears = animal === 'rabbit'
      ? `<path d="M22 23C9-5 24-4 27 22M37 22C40-4 55-5 42 24" fill="${fur}" stroke="${ink}" stroke-width="1.5"/><path d="M21 10l4 12m17-12-3 12" stroke="#d49c8a" stroke-width="3" stroke-linecap="round"/>`
      : animal === 'cat'
        ? `<path d="M15 29l-1-17 16 10m4 0 16-10-1 17" fill="${fur}" stroke="${ink}" stroke-width="1.5"/><path d="m18 19 2 8 6-3m20-5-2 8-6-3" fill="#c78573"/>`
        : `<circle cx="18" cy="21" r="8" fill="${animal === 'panda' ? ink : fur}"/><circle cx="46" cy="21" r="8" fill="${animal === 'panda' ? ink : fur}"/><circle cx="18" cy="21" r="4" fill="#bc8070"/><circle cx="46" cy="21" r="4" fill="#bc8070"/>`;
    if (animal === 'dragon' || animal === 'deer') ears += `<path d="m22 22-3-14m1 7-5-3m27 10 3-14m-1 7 5-3" stroke="${gold}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
    const markings = animal === 'panda'
      ? `<ellipse cx="24" cy="32" rx="6" ry="7" transform="rotate(24 24 32)" fill="${ink}"/><ellipse cx="40" cy="32" rx="6" ry="7" transform="rotate(-24 40 32)" fill="${ink}"/><circle cx="24" cy="31" r="1.8" fill="${cream}"/><circle cx="40" cy="31" r="1.8" fill="${cream}"/>`
      : `<path d="M24 32h.1m15.8 0h.1" stroke="${ink}" stroke-width="3.5" stroke-linecap="round"/>`;
    figure = `${ears}<path d="M8 65q1-18 24-19 23 1 24 19" fill="${palette[2]}"/><path d="m24 48 8 10 8-10" fill="${gold}"/>
      <path d="M16 30q0-12 16-12t16 12v6q-1 14-16 14T16 36Z" fill="${fur}" stroke="${ink}" stroke-width="1.2"/>
      ${animal === 'tiger' ? `<path d="m27 20 5 7 5-7M16 29l7 3-7 2m32-5-7 3 7 2" fill="${ink}"/>` : ''}
      ${markings}<ellipse cx="32" cy="40" rx="9" ry="6" fill="${cream}"/><path d="m29 37 3 3 3-3Z" fill="${ink}"/>
      <path d="M32 40v2m-4 0q4 3 8 0" fill="none" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="32" cy="60" r="2" fill="${gold}"/>`;
  } else {
    const skin = ['#edbd94', '#dba67e', '#b97e58', '#f2cba3'][seed >>> 3 & 3];
    const hair = ['#302b29', '#46352c', '#322c2d', '#ddd1af'][seed >>> 5 & 3];
    const elder = isBot && /Grandma|Uncle Fu|Auntie Mei/.test(name);
    const longHair = isBot ? /Auntie|Grandma/.test(name) : (seed & 1) === 0;
    const spectacles = elder || (seed % 5 === 0);
    figure = `${longHair ? `<path d="M14 31q-1-20 18-20t18 20l3 22H11Z" fill="${elder ? '#d8ceba' : hair}"/>` : ''}
      <path d="M7 65q1-19 25-19t25 19" fill="${palette[2]}"/>
      <path d="M27 42h10v10l-5 5-5-5Z" fill="${skin}"/>
      <path d="m25 48 7 9-7 5-6-11m20-3-7 9 7 5 6-11" fill="${gold}"/>
      <path d="M17 28q-5-1-4 5t6 5m28-10q5-1 4 5t-6 5" fill="${skin}"/>
      <path d="M17 26q0-15 15-15t15 15v9q-1 14-15 15T17 35Z" fill="${skin}"/>
      <path d="M17 30q-7-17 6-20 20-7 25 12v9l-6-10q-12 4-20-1Z" fill="${elder ? '#ded5c0' : hair}"/>
      <path d="M20 28q4-2 8 0m8 0q4-2 8 0" stroke="${ink}" stroke-opacity=".7" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      ${eyes}<path d="m32 33-1 4h3" stroke="#a26952" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      <ellipse cx="22" cy="38" rx="3" ry="1.5" fill="#cd816f" opacity=".45"/><ellipse cx="42" cy="38" rx="3" ry="1.5" fill="#cd816f" opacity=".45"/>
      ${spectacles ? `<g fill="none" stroke="${gold}" stroke-width="1.7"><rect x="18.5" y="29" width="11" height="8" rx="3"/><rect x="34.5" y="29" width="11" height="8" rx="3"/><path d="M29.5 32h5"/></g>` : ''}
      ${isBot && /Ninja|Wizard|Hero/.test(name) ? `<path d="M15 25q17-9 34 0l-2-8q-15-10-30 0Z" fill="${palette[2]}"/><path d="M17 22q15-6 30 0" fill="none" stroke="${gold}" stroke-width="2"/>` : ''}
      <path d="M32 57v7" stroke="${gold}" stroke-width="1.2"/><circle cx="35" cy="61" r="1" fill="${gold}"/>`;
  }
  return `<svg class="player-portrait" viewBox="0 0 64 64" width="100%" height="100%" style="display:block;border-radius:50%" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="${id}" cx="30%" cy="18%" r="90%"><stop stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[0]}"/></radialGradient><clipPath id="${id}-clip"><circle cx="32" cy="32" r="31"/></clipPath></defs>
    <circle cx="32" cy="32" r="32" fill="url(#${id})"/>
    <circle cx="32" cy="29" r="23" fill="none" stroke="${gold}" stroke-opacity=".18" stroke-width=".8"/>
    <path d="m8 14 2-3 2 3-2 3Zm44 31 1.5-2.5L55 45l-1.5 2.5Z" fill="${gold}" opacity=".55"/>
    <g clip-path="url(#${id}-clip)">${figure}</g>
    <circle cx="32" cy="32" r="30.8" fill="none" stroke="${gold}" stroke-opacity=".5" stroke-width=".8"/>
  </svg>`;
}
avatarPortrait.serial = 0;
