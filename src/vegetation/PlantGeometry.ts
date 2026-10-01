import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry, SphereGeometry } from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

type Plant = 'pine' | 'cactus' | 'broadleaf' | 'autumn' | 'bare' | 'blossom' | 'shrub' | 'rock' | 'grass' | 'meadow' | 'flowers' | 'flowerSpikes' | 'seedheads';
function colored(geometry: BufferGeometry, color: string): BufferGeometry {
  const rgb = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

function crown(radius: number, color: string): BufferGeometry {
  const geometry = new IcosahedronGeometry(radius, 1), position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3), base = new Color(color), tint = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) / radius, y = position.getY(i) / radius, z = position.getZ(i) / radius;
    const variation = Math.sin(x * 7 + z * 4) * Math.cos(y * 5 - z * 3);
    const lobes = Math.sin(Math.atan2(z, x) * 3 + y * 2) * Math.max(0, 1 - y * y);
    const scale = 0.93 + variation * 0.05 + lobes * 0.09;
    position.setXYZ(i, x * radius * scale, y * radius * scale, z * radius * scale);
    tint.copy(base).multiplyScalar(0.96 + variation * 0.1 + y * 0.04).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  return geometry;
}

function pineTier(radius: number, height: number, color: string): BufferGeometry {
  const geometry = new ConeGeometry(radius, height, 16), position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3), base = new Color(color), tint = new Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i), angle = Math.atan2(x, z);
    const branch = Math.cos(angle * 8), reach = 0.87 + branch * 0.13;
    const edge = Math.hypot(x, z) > radius * 0.5;
    position.setXYZ(i, x * reach, y + (edge ? height * (0.065 - branch * 0.045) : 0), z * reach);
    tint.copy(base).multiplyScalar(edge ? 0.8 + branch * 0.12 : y > 0 ? 1.08 : 0.68).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3)); geometry.computeVertexNormals();
  return geometry;
}

function leaf(height: number, width: number, bend: number, color: string): BufferGeometry {
  const vertices: number[] = [], indices: number[] = [], colors: number[] = [], base = new Color(color);
  for (let row = 0; row < 3; row++) {
    const t = row / 2, half = width * (row === 1 ? 0.5 : row === 0 ? 0.18 : 0.015);
    for (const side of [-1, 0, 1]) {
      vertices.push(side * half, height * t, bend * t * t + (side === 0 ? width * 0.15 * Math.sin(t * Math.PI) : 0));
      const tint = base.clone().multiplyScalar(0.72 + t * 0.32 + (side === 0 ? 0.06 : 0));
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  for (let row = 0; row < 2; row++) for (let col = 0; col < 2; col++) {
    const a = row * 3 + col, b = a + 1, c = a + 3, d = c + 1;
    indices.push(a, b, c, b, d, c, c, b, a, c, d, b);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
  geometry.setIndex(indices);
  const faces = geometry.toNonIndexed(); geometry.dispose(); faces.computeVertexNormals();
  return faces;
}

function petal(length: number, width: number, color: string): BufferGeometry {
  const geometry = new BufferGeometry();
  const positions = [0, 0.01, length * 0.5];
  const outline = [[0, 0], [-0.35, 0.25], [-0.5, 0.65], [-0.32, 0.93], [0, 1], [0.32, 0.93], [0.5, 0.65], [0.35, 0.25]];
  const indices: number[] = [];
  for (const [x, t] of outline) positions.push(x * width, 0.045 * t * t, length * t);
  for (let i = 0; i < outline.length; i++) { const a = i + 1, b = (i + 1) % outline.length + 1; indices.push(0, b, a, 0, a, b); }
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
  geometry.setIndex(indices);
  const faces = geometry.toNonIndexed(); geometry.dispose(); faces.computeVertexNormals();
  return colored(faces, color);
}

export function plantGeometry(kind: Plant, detail: 'near' | 'middle' | 'distant' = 'near'): BufferGeometry {
  let pieces: BufferGeometry[];
  if (kind === 'bare') {
    pieces = [colored(new CylinderGeometry(0.13, 0.5, 9, detail === 'distant' ? 3 : 5, 1, detail === 'distant').rotateZ(0.045).translate(0, 4.5, 0), '#75634c')];
    for (let i = 0; i < (detail === 'near' ? 7 : 3); i++) {
      const angle = i * 2.4, y = 4.6 + i * 0.62;
      pieces.push(colored(new CylinderGeometry(0.035, 0.17, 4.4, detail === 'distant' ? 3 : 4, 1, detail === 'distant').rotateZ(-0.7).rotateY(angle)
        .translate(Math.cos(angle) * 1.2, y + 0.8, -Math.sin(angle) * 1.2), '#806b50'));
      if (detail === 'near') pieces.push(colored(new CylinderGeometry(0.015, 0.065, 2.1, 3).rotateZ(0.45).rotateY(angle)
        .translate(Math.cos(angle) * 2.1, y + 2, -Math.sin(angle) * 2.1), '#89735a'));
    }
  } else if (detail === 'distant') {
    pieces = kind === 'pine' ? [colored(new ConeGeometry(3.3, 11, 5).translate(0, 7.5, 0), '#51704a')]
      : kind === 'broadleaf' || kind === 'autumn' || kind === 'blossom' ? [colored(new IcosahedronGeometry(3.9, 0).scale(1, 1.15, 1).translate(0, 8.5, 0), kind === 'autumn' ? '#c39743' : '#71894e')]
        : [colored(new CylinderGeometry(0.4, 0.55, 6, 4).translate(0, 3, 0), '#82945e')];
    if (kind === 'cactus') for (const side of [-1, 1]) pieces.push(colored(new CylinderGeometry(0.22, 0.3, 2.6, 3, 1, true).rotateZ(side * 0.65)
      .translate(side * 0.85, 3.2 + side * 0.6, 0), '#8a9c63'));
    if (kind !== 'cactus') pieces.push(colored(new CylinderGeometry(0.16, 0.42, 7, 3, 1, true).translate(0, 3.5, 0), '#75634c'));
  } else if (kind === 'pine' && detail === 'middle') {
    pieces = [colored(new CylinderGeometry(0.17, 0.46, 10.5, 5).translate(0, 5.25, 0), '#716048')];
    for (const [radius, height, y, tint] of [[3.4, 5.8, 5.3, '#486741'], [2.45, 5.4, 8.1, '#638451'], [1.4, 4.8, 11.1, '#76935e']] as const)
      pieces.push(colored(new ConeGeometry(radius, height, 6).translate(0, y, 0), tint));
  } else if (kind === 'pine') {
    pieces = [colored(new CylinderGeometry(0.17, 0.46, 10.5, 6).translate(0, 5.25, 0), '#716048')];
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4;
      pieces.push(pineTier(3.4 - i * 0.46, 3.8 - i * 0.17, ['#486741', '#5b7b49', '#718d58'][Math.floor(i / 2)])
        .rotateY(angle).translate(Math.sin(angle) * 0.25, 4.5 + i * 1.5, Math.cos(angle) * 0.25));
      if (i < 3) pieces.push(colored(new CylinderGeometry(0.045, 0.12, 2.8, 4).rotateZ(-0.95).rotateY(angle)
        .translate(Math.cos(angle) * 0.85, 3.3 + i * 1.4, -Math.sin(angle) * 0.85), '#77634b'));
      if (i < 4) pieces.push(colored(new ConeGeometry(0.85 - i * 0.1, 2, 5).scale(1, 1, 0.8).rotateZ(0.25).rotateY(angle)
        .translate(Math.cos(angle) * (2.4 - i * 0.35), 4.2 + i * 1.5, Math.sin(angle) * (2.4 - i * 0.35)), i % 2 ? '#577b45' : '#75915a'));
      if (i < 3) for (const side of [-1, 1]) {
        const a = angle + side * 0.4, reach = 2.7 - i * 0.4;
        pieces.push(colored(new ConeGeometry(0.48, 1.35, 4).scale(1, 1, 0.65).rotateZ(side * 0.45).rotateY(a)
          .translate(Math.cos(a) * reach, 3.8 + i * 1.5, Math.sin(a) * reach), side < 0 ? '#456b42' : '#769354'));
      }
    }
  } else if (kind === 'broadleaf' || kind === 'autumn' || kind === 'blossom') {
    pieces = [colored(new CylinderGeometry(0.2, 0.5, 7, 6).rotateZ(0.045).translate(0, 3.5, 0), '#75634c')];
    for (let i = 0; i < 4; i++) {
      const angle = i * 2.4;
      if (detail === 'near') pieces.push(colored(new CylinderGeometry(0.07, 0.19, 4.2, 5).rotateZ(-0.6).rotateY(angle)
        .translate(Math.cos(angle), 6.1, -Math.sin(angle)), '#806b50'));
      const radius = i === 0 ? 3.3 : 2.4, tint = (kind === 'autumn' ? ['#c9903d', '#d8b354', '#ae6340', '#cba252'] : ['#728d49', '#839b56', '#607b43', '#8e9e5e'])[i];
      pieces.push((detail === 'near' ? crown(radius, tint) : colored(new IcosahedronGeometry(radius * 0.94, 0), tint))
        .scale(1, 1.12, 0.9).rotateY(angle).translate(Math.cos(angle) * (i ? 2 : 0), i ? 7.5 : 9.1, -Math.sin(angle) * (i ? 1.8 : 0)));
      if (detail === 'near') {
        pieces.push(colored(new CylinderGeometry(0.025, 0.075, 1.8, 4).rotateZ(-0.85).rotateY(angle)
          .translate(Math.cos(angle) * 2.15, 6.5, -Math.sin(angle) * 2.15), '#89735a'));
        for (const side of [-1, 1]) {
          const a = angle + side * 0.23;
          pieces.push(colored(new IcosahedronGeometry(0.85, 0).scale(1, 0.65, 0.85).rotateY(a)
            .translate(Math.cos(a) * 3.15, 6.3 + i * 0.25, -Math.sin(a) * 3.15), tint));
        }
      }
      if (kind === 'blossom') for (let j = 0; j < (detail === 'near' ? 5 : 2); j++) {
        const a = angle + j * 2.4;
        pieces.push(colored(new IcosahedronGeometry(0.38, 0).scale(1, 0.7, 1)
          .translate(Math.cos(angle) * (i ? 2 : 0) + Math.cos(a) * radius * 0.8, (i ? 7.5 : 9.1) + radius * 0.5,
            -Math.sin(angle) * (i ? 1.8 : 0) + Math.sin(a) * radius * 0.65), j % 2 ? '#f1d8d7' : '#ead7b8'));
      }
    }
  } else if (kind === 'cactus') {
    pieces = [
      colored(new CylinderGeometry(0.4, 0.55, 6, 7).translate(0, 3, 0), '#7c905b'),
      colored(new CylinderGeometry(0.3, 0.34, 1.8, 6).rotateZ(Math.PI / 2).translate(0.8, 2.6, 0), '#8a9c63'),
      colored(new CylinderGeometry(0.27, 0.34, 2.3, 6).translate(1.6, 3.6, 0), '#8a9c63'),
      colored(new CylinderGeometry(0.27, 0.32, 1.5, 6).rotateZ(Math.PI / 2).translate(-0.7, 3.7, 0), '#728753'),
      colored(new CylinderGeometry(0.24, 0.3, 1.7, 6).translate(-1.35, 4.4, 0), '#728753'),
      colored(new SphereGeometry(0.4, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 6, 0), '#8b9e63'),
      colored(new SphereGeometry(0.27, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(1.6, 4.75, 0), '#97a96f'),
      colored(new SphereGeometry(0.24, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(-1.35, 5.25, 0), '#83975d'),
    ];
    if (detail === 'near') for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + Math.PI / 2, x = Math.cos(angle), z = Math.sin(angle);
      pieces.push(colored(new CylinderGeometry(0.018, 0.025, 5.7, 3).rotateZ(0.025).rotateY(-angle)
        .translate(x * 0.465, 3, z * 0.465), i % 2 ? '#9eb078' : '#687e4c'));
      for (const y of [1.7, 3, 4.3]) pieces.push(colored(new ConeGeometry(0.022, 0.15, 3).rotateZ(-Math.PI / 2).rotateY(-angle)
        .translate(x * (0.625 - y * 0.025), y, z * (0.625 - y * 0.025)), '#c6bd91'));
    }
  } else if (detail === 'middle' && kind === 'grass') {
    pieces = [];
    for (let i = 0; i < 4; i++) {
      const geometry = new BufferGeometry(), angle = i * 2.4;
      geometry.setAttribute('position', new BufferAttribute(new Float32Array([-0.18, 0, 0, 0.18, 0, 0, 0.1, 0.55 + i % 3 * 0.18, 0.22]), 3));
      geometry.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2));
      geometry.setIndex([0, 1, 2, 2, 1, 0]);
      const faces = geometry.toNonIndexed(); geometry.dispose(); faces.computeVertexNormals();
      pieces.push(colored(faces.rotateY(angle).translate(Math.sin(angle) * 0.4, 0, Math.cos(angle) * 0.4), '#ffffff'));
    }
  } else if (kind === 'shrub') {
    pieces = [colored(new IcosahedronGeometry(1.2, 0).scale(1, 0.7, 1).translate(0, 0.7, 0), '#ffffff'),
      colored(new IcosahedronGeometry(0.85, 0).scale(1, 0.8, 1).translate(0.8, 0.5, 0.4), '#d4dfbd'),
      colored(new IcosahedronGeometry(0.8, 0).scale(1, 0.75, 1).translate(-0.6, 0.5, -0.6), '#c0cda9')];
    for (let i = 0; detail === 'near' && i < 5; i++) {
      const angle = i * 2.4;
      pieces.push(colored(new CylinderGeometry(0.025, 0.07, 1.1, 4).rotateZ(0.5).rotateY(angle).translate(0, 0.45, 0), '#827654'));
      for (let j = 0; j < 3; j++) pieces.push(leaf(0.3, 0.14, 0.1, j % 2 ? '#dee6c7' : '#aebf93')
        .rotateZ(0.8 + j * 0.2).rotateY(angle + j).translate(Math.cos(angle) * 0.8, 0.65 + j * 0.17, Math.sin(angle) * 0.8));
      pieces.push(colored(new IcosahedronGeometry(0.06, 0).scale(1, 1.2, 1)
        .translate(Math.cos(angle) * 0.82, 1.05, Math.sin(angle) * 0.82), i % 2 ? '#d9c390' : '#b88f74'));
    }
  } else if (kind === 'rock') {
    pieces = [(detail === 'near' ? crown(1.75, '#c1c0ab') : colored(new IcosahedronGeometry(1.7, 0), '#c1c0ab')).scale(1.05, 0.62, 0.8).rotateY(0.3).translate(0, 0.65, 0),
      colored(new IcosahedronGeometry(0.65, 0).scale(1, 0.7, 1).translate(1.3, 0.25, 0.7), '#989e8e')];
    for (let i = 0; detail === 'near' && i < 5; i++) {
      const angle = i * 2.4, radius = 1.5 + i % 2 * 0.3;
      pieces.push(colored(new IcosahedronGeometry(0.18 + i % 3 * 0.08, 0).scale(1.2, 0.55, 0.8).rotateY(angle)
        .translate(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius * 0.72), i % 2 ? '#b3ad96' : '#969b88'));
    }
  } else if (kind === 'seedheads') {
    pieces = [];
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4, x = Math.cos(angle) * 0.4, z = Math.sin(angle) * 0.4, h = 0.38 + i * 0.06;
      pieces.push(colored(new CylinderGeometry(0.012, 0.02, h, 3).translate(x, h / 2, z), '#978252'),
        colored(new IcosahedronGeometry(0.07, 0).scale(1, 1.4, 1).translate(x, h, z), '#b59a69'));
    }
  } else if (kind === 'flowerSpikes') {
    pieces = [];
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4, x = Math.cos(angle) * 0.4, z = Math.sin(angle) * 0.4, h = 0.65 + i * 0.05;
      pieces.push(colored(new CylinderGeometry(0.013, 0.025, h, 3).translate(x, h / 2, z), '#668246'));
      for (let j = 0; j < 4; j++) pieces.push(colored(new IcosahedronGeometry(0.085 - j * 0.012, 0).scale(1, 1.35, 1)
        .translate(x, h - 0.18 + j * 0.07, z), i % 2 ? '#b8a3ce' : '#817bb1'));
      for (const side of [-1, 1]) pieces.push(leaf(0.3, 0.09, 0.06, '#829855').rotateZ(side * 0.8).rotateY(angle)
        .translate(x + side * 0.02, 0.18, z));
    }
  } else if (kind === 'meadow' || kind === 'flowers') {
    pieces = [];
    for (let i = 0; i < (kind === 'flowers' ? 8 : 18); i++) {
      const angle = i * 2.4, radius = 0.18 + (i % 4) * 0.15, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const h = 0.19 + (i % 7) * 0.058;
      pieces.push(leaf(h, 0.045 + i % 3 * 0.025, 0.08 + i % 4 * 0.045, i % 3 ? '#71954b' : '#b0af67')
        .rotateZ(Math.sin(angle) * 0.18).rotateY(angle).translate(x, 0, z));
    }
    if (kind === 'meadow') for (let i = 0; i < 2; i++) {
      const x = i ? 0.23 : -0.18, height = 0.55 + i * 0.1;
      pieces.push(colored(new CylinderGeometry(0.008, 0.012, height, 3).translate(x, height / 2, 0.2), '#9a9d58'));
      for (let j = 0; j < 3; j++) pieces.push(colored(new IcosahedronGeometry(0.027, 0).scale(0.6, 1.7, 1)
        .translate(x + (j % 2 ? -0.022 : 0.022), height - 0.07 + j * 0.04, 0.2), '#c4b276'));
    }
    if (kind === 'flowers') for (let i = 0; i < 4; i++) {
      const x = Math.sin(i * 2.4) * 0.42, z = Math.cos(i * 2.4) * 0.42, height = 0.35 + i * 0.075;
      pieces.push(colored(new CylinderGeometry(0.012, 0.02, height, 3).translate(x, height / 2, z), '#668246'));
      const petals = i % 2 ? 6 : 8;
      for (let j = 0; j < petals; j++) {
        const angle = j * Math.PI * 2 / petals + i * 0.7;
        pieces.push(petal(0.14 + i % 2 * 0.035, 0.095, ['#f2e5c5', '#e6ba48', '#b3a3d2', '#eee7d4'][i])
          .rotateY(angle).rotateZ(Math.sin(i * 2.4) * 0.22).translate(x, height, z));
      }
      pieces.push(colored(new IcosahedronGeometry(0.037, 0).translate(x, height + 0.02, z), '#b48b31'));
      for (const side of [-1, 1]) pieces.push(leaf(0.18, 0.07, 0.045, '#829855')
        .rotateZ(side * 0.9).rotateY(i * 2.4).translate(x, height * 0.45, z));
      pieces.push(colored(new ConeGeometry(0.038, 0.06, 5).rotateX(Math.PI).translate(x, height - 0.025, z), '#668246'));
    }
  } else {
    pieces = [];
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4, x = Math.sin(angle) * 0.52, z = Math.cos(angle) * 0.52, h = 0.55 + (i % 3) * 0.18;
      pieces.push(leaf(h, 0.13, 0.18 + i % 3 * 0.08, '#ffffff').rotateY(angle).translate(x, 0, z));
    }
  }
  if (detail === 'near' && (kind === 'pine' || kind === 'broadleaf' || kind === 'autumn')) for (let i = 0; i < 4; i++) {
    const angle = i * 2.4;
    pieces.push(colored(new ConeGeometry(0.3, 1.5, 4).rotateZ(0.95).rotateY(angle)
      .translate(Math.cos(angle) * 0.35, 0.35, -Math.sin(angle) * 0.35), '#716048'));
  }
  const normalized = pieces.map(piece => piece.index ? piece : mergeVertices(piece)), geometry = mergeGeometries(normalized)!;
  for (let i = 0; i < pieces.length; i++) { if (normalized[i] !== pieces[i]) normalized[i].dispose(); pieces[i].dispose(); }
  return geometry;
}
