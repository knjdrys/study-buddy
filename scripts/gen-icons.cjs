// Regenerate PWA PNGs from public/icons/icon.svg
const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const svg = fs.readFileSync('public/icons/icon.svg', 'utf8');
for (const size of [192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(`public/icons/icon-${size}.png`, png);
  fs.writeFileSync(`public/icons/icon-maskable-${size}.png`, png);
  console.log('wrote icon-' + size + '.png');
}
// apple-touch: 180
const png180 = new Resvg(svg, { fitTo: { mode: 'width', value: 180 } }).render().asPng();
fs.writeFileSync('public/icons/apple-touch-icon.png', png180);
console.log('wrote apple-touch-icon.png');
