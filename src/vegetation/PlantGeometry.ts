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
    const variation = Math.sin(x * 7 + z * 4) * Math.cos(y * 5 - z * 3), scale = 0.94 + variation * 0.06;
    position.setXYZ(i, x * radius * scale, y * radius * scale, z * radius * scale);
    tint.copy(base).multiplyScalar(0.96 + variation * 0.1 + y * 0.04).toArray(colors, i * 3);
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
  } else if (kind === 'pine' && detail === 'middle') {
    pieces = [colored(new CylinderGeometry(0.17, 0.46, 10.5, 5).translate(0, 5.25, 0), '#716048')];
    for (const [radius, height, y, tint] of [[3.4, 5.8, 5.3, '#486741'], [2.45, 5.4, 8.1, '#638451'], [1.4, 4.8, 11.1, '#76935e']] as const)
      pieces.push(colored(new ConeGeometry(radius, height, 6).translate(0, y, 0), tint));
  } else if (kind === 'pine') {
    pieces = [colored(new CylinderGeometry(0.17, 0.46, 10.5, 6).translate(0, 5.25, 0), '#716048')];
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4;
      pieces.push(colored(new ConeGeometry(3.4 - i * 0.46, 3.8 - i * 0.17, 7 - i % 2)
        .rotateY(angle).translate(Math.sin(angle) * 0.25, 4.5 + i * 1.5, Math.cos(angle) * 0.25), i % 3 === 0 ? '#486741' : i % 3 === 1 ? '#638451' : '#76935e'));
      if (i < 3) pieces.push(colored(new CylinderGeometry(0.045, 0.12, 2.8, 4).rotateZ(-0.95).rotateY(angle)
        .translate(Math.cos(angle) * 0.85, 3.3 + i * 1.4, -Math.sin(angle) * 0.85), '#77634b'));
      if (i < 4) pieces.push(colored(new ConeGeometry(0.85 - i * 0.1, 2, 5).scale(1, 1, 0.8).rotateZ(0.25).rotateY(angle)
        .translate(Math.cos(angle) * (2.4 - i * 0.35), 4.2 + i * 1.5, Math.sin(angle) * (2.4 - i * 0.35)), i % 2 ? '#577b45' : '#75915a'));
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
  } else if (kind === 'shrub') {
    pieces = [colored(new IcosahedronGeometry(1.2, 0).scale(1, 0.7, 1).translate(0, 0.7, 0), '#ffffff'),
      colored(new IcosahedronGeometry(0.85, 0).scale(1, 0.8, 1).translate(0.8, 0.5, 0.4), '#d4dfbd'),
      colored(new IcosahedronGeometry(0.8, 0).scale(1, 0.75, 1).translate(-0.6, 0.5, -0.6), '#c0cda9')];
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4;
      pieces.push(colored(new CylinderGeometry(0.025, 0.07, 1.1, 4).rotateZ(0.5).rotateY(angle).translate(0, 0.45, 0), '#827654'));
      for (let j = 0; j < 3; j++) pieces.push(leaf(0.3, 0.14, 0.1, j % 2 ? '#dee6c7' : '#aebf93')
        .rotateZ(0.8 + j * 0.2).rotateY(angle + j).translate(Math.cos(angle) * 0.8, 0.65 + j * 0.17, Math.sin(angle) * 0.8));
    }
  } else if (kind === 'rock') {
    pieces = [crown(1.75, '#c1c0ab').scale(1.05, 0.62, 0.8).rotateY(0.3).translate(0, 0.65, 0),
      colored(new IcosahedronGeometry(0.65, 0).scale(1, 0.7, 1).translate(1.3, 0.25, 0.7), '#989e8e')];
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
    for (let i = 0; i < (kind === 'flowers' ? 8 : 22); i++) {
      const angle = i * 2.4, radius = 0.18 + (i % 4) * 0.15, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const h = 0.24 + (i % 5) * 0.065;
      pieces.push(leaf(h, 0.075, 0.08 + i % 3 * 0.04, i % 3 ? '#71954b' : '#96a65b').rotateY(angle).translate(x, 0, z));
    }
    if (kind === 'flowers') for (let i = 0; i < 4; i++) {
      const x = Math.sin(i * 2.4) * 0.42, z = Math.cos(i * 2.4) * 0.42, height = 0.35 + i * 0.075;
      pieces.push(colored(new CylinderGeometry(0.012, 0.02, height, 3).translate(x, height / 2, z), '#668246'));
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        pieces.push(leaf(0.16, 0.11, 0.025, ['#f2e5c5', '#e6ba48', '#b3a3d2', '#eee7d4'][i])
          .rotateX(Math.PI / 2 - 0.2).rotateY(angle).translate(x, height, z));
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
