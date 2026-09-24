// Install QR for the R1 (creations-sdk qr payload).
import QRCode from 'qrcode';
const payload = {
  title: 'Geometry Rabbit',
  url: 'https://joefts.github.io/geometry-r1/src/index.html',
  description: 'Geometry Dash-style runner with a chiptune soundtrack',
  iconUrl: 'https://joefts.github.io/geometry-r1/src/icon.png',
  themeColor: '#FF4F00',
};
await QRCode.toFile(new URL('../docs/install-qr.png', import.meta.url).pathname, JSON.stringify(payload), { width: 480, margin: 2 });
console.log(JSON.stringify(payload));
