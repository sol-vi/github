// 線画アイコン（すべて自作SVG）。線の太さは non-scaling-stroke で全アイコン共通。
const STROKE = 8;

const shapes = {
  // ソファとコート
  sofaCoat: {
    vb: [0, 0, 470, 240],
    d: `
      <g transform="translate(0,50)">
        <path d="M50 98 V50 a22 22 0 0 1 22 -22 H188 a22 22 0 0 1 22 22 V98"/>
        <rect x="10" y="80" width="40" height="82" rx="18"/>
        <rect x="210" y="80" width="40" height="82" rx="18"/>
        <path d="M50 118 H210 M50 162 H210 M130 118 V162"/>
        <path d="M42 162 V184 M218 162 V184"/>
      </g>
      <g transform="translate(310,8)">
        <path d="M52 22 L20 40 L6 128 L32 134 L40 88 V222 H112 V88 L120 134 L146 128 L132 40 L100 22"/>
        <path d="M52 22 L76 62 L100 22 M76 62 V222"/>
      </g>`
  },
  // ヒーター
  heater: {
    vb: [0, 0, 400, 300],
    d: `
      <rect x="60" y="120" width="280" height="140" rx="18"/>
      <path d="M110 155 V225 M155 155 V225 M200 155 V225 M245 155 V225 M290 155 V225"/>
      <path d="M100 260 V284 M300 260 V284"/>
      <path d="M130 92 c-18 -14 18 -30 0 -44 c-10 -8 -6 -18 0 -24"/>
      <path d="M200 92 c-18 -14 18 -30 0 -44 c-10 -8 -6 -18 0 -24"/>
      <path d="M270 92 c-18 -14 18 -30 0 -44 c-10 -8 -6 -18 0 -24"/>`
  },
  // 浴槽と湯気
  bath: {
    vb: [0, 0, 400, 300],
    d: `
      <path d="M30 150 H370"/>
      <path d="M56 150 V200 a54 54 0 0 0 54 54 H290 a54 54 0 0 0 54 -54 V150"/>
      <path d="M112 254 L102 280 M288 254 L298 280"/>
      <path d="M130 112 c-18 -14 18 -30 0 -44 c-10 -8 -6 -18 0 -24"/>
      <path d="M200 112 c-18 -14 18 -30 0 -44 c-10 -8 -6 -18 0 -24"/>
      <path d="M270 112 c-18 -14 18 -30 0 -44 c-10 -8 -6 -18 0 -24"/>`
  },
  // 時計
  clock: {
    vb: [0, 0, 300, 300],
    d: `
      <circle cx="150" cy="150" r="130"/>
      <path d="M150 42 V62 M150 238 V258 M42 150 H62 M238 150 H258"/>
      <path d="M150 150 V84 M150 150 L198 178"/>`
  },
  // リビング（ソファ・クッション・ブランケット・フロアランプ）
  cushion: {
    vb: [0, 0, 400, 300],
    d: `
      <g transform="translate(-34,0)">
        <path d="M90 158 V112 a22 22 0 0 1 22 -22 H288 a22 22 0 0 1 22 22 V158"/>
        <rect x="50" y="140" width="40" height="102" rx="18"/>
        <rect x="310" y="140" width="40" height="102" rx="18"/>
        <path d="M90 182 H310 M90 242 H310"/>
        <path d="M82 242 V266 M318 242 V266"/>
        <rect x="108" y="118" width="54" height="54" rx="10" transform="rotate(-10 135 145)"/>
        <path d="M226 182 V210 H290 V182"/>
        <path d="M238 210 V222 M258 210 V222 M278 210 V222"/>
      </g>
      <path d="M368 266 V126 M350 266 H386"/>
      <path d="M344 126 L354 82 H382 L392 126 Z"/>`
  },
  // コメント
  comment: {
    vb: [0, 0, 100, 100],
    d: `<path d="M50 12 a38 38 0 1 1 -18 71.5 L12 88 l5.5 -19 A38 38 0 0 1 50 12 Z"/>`
  },
  // シェア（紙飛行機）
  share: {
    vb: [0, 0, 100, 100],
    d: `<path d="M90 12 L10 42 L44 56 L58 90 Z M44 56 L90 12"/>`
  },
  // 次へ
  next: {
    vb: [0, 0, 100, 60],
    d: `<path d="M6 30 H92 M66 6 L92 30 L66 54"/>`
  }
};

function icon(name, { width, color }) {
  const s = shapes[name];
  if (!s) throw new Error(`unknown icon: ${name}`);
  const [x, y, w, h] = s.vb;
  const height = Math.round((width * h) / w);
  // はみ出し防止に線幅ぶんの余白を viewBox に足す
  const pad = (STROKE * w) / width;
  return `<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
    viewBox="${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}" fill="none" stroke="${color}"
    stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <g style="vector-effect:non-scaling-stroke">${s.d.replace(/<(path|rect|circle)/g, '<$1 vector-effect="non-scaling-stroke"')}</g></svg>`;
}

module.exports = { icon, STROKE };
