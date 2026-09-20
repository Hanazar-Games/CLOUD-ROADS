import { BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, IcosahedronGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Plant = 'pine' | 'cactus' | 'broadleaf' | 'autumn' | 'shrub' | 'rock' | 'grass' | 'meadow' | 'flowers' | 'flowerSpikes';
function colored(geometry: BufferGeometry, color: string): BufferGeometry {
  const rgb = new Color(color), colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

export function plantGeometry(kind: Plant, distant = false): BufferGeometry {
  let pieces: BufferGeometry[];
  if (distant) {
    pieces = kind === 'pine' ? [colored(new ConeGeometry(3.3, 11, 5).translate(0, 7.5, 0), '#51704a')]
      : kind === 'broadleaf' || kind === 'autumn' ? [colored(new IcosahedronGeometry(3.9, 0).scale(1, 1.15, 1).translate(0, 8.5, 0), kind === 'autumn' ? '#c39743' : '#71894e')]
        : [colored(new CylinderGeometry(0.4, 0.55, 6, 4).translate(0, 3, 0), '#82945e')];
  } else if (kind === 'pine') {
    pieces = [colored(new CylinderGeometry(0.17, 0.46, 10.5, 6).translate(0, 5.25, 0), '#716048')];
    for (let i = 0; i < 6; i++) {
      const angle = i * 2.4;
      pieces.push(colored(new ConeGeometry(3.4 - i * 0.46, 3.8 - i * 0.17, 7 - i % 2)
        .rotateY(angle).translate(Math.sin(angle) * 0.25, 4.5 + i * 1.5, Math.cos(angle) * 0.25), i % 3 === 0 ? '#486741' : i % 3 === 1 ? '#638451' : '#76935e'));
      if (i < 3) pieces.push(colored(new CylinderGeometry(0.045, 0.12, 2.8, 4).rotateZ(-0.95).rotateY(angle)
        .translate(Math.cos(angle) * 0.85, 3.3 + i * 1.4, -Math.sin(angle) * 0.85), '#77634b'));
    }
  } else if (kind === 'broadleaf' || kind === 'autumn') {
    pieces = [colored(new CylinderGeometry(0.2, 0.5, 7, 6).rotateZ(0.045).translate(0, 3.5, 0), '#75634c')];
    for (let i = 0; i < 4; i++) {
      const angle = i * 2.4;
      pieces.push(colored(new CylinderGeometry(0.07, 0.19, 4.2, 5).rotateZ(-0.6).rotateY(angle)
        .translate(Math.cos(angle), 6.1, -Math.sin(angle)), '#806b50'));
      pieces.push(colored(new IcosahedronGeometry(i === 0 ? 3.3 : 2.4, 0).scale(1, 1.12, 0.9).rotateY(angle)
        .translate(Math.cos(angle) * (i ? 2 : 0), i ? 7.5 : 9.1, -Math.sin(angle) * (i ? 1.8 : 0)), (kind === 'autumn' ? ['#c9903d', '#d8b354', '#ae6340', '#cba252'] : ['#728d49', '#839b56', '#607b43', '#8e9e5e'])[i]));
    }
  } else if (kind === 'cactus') {
    pieces = [
      colored(new CylinderGeometry(0.4, 0.55, 6, 7).translate(0, 3, 0), '#7c905b'),
      colored(new CylinderGeometry(0.3, 0.34, 1.8, 6).rotateZ(Math.PI / 2).translate(0.8, 2.6, 0), '#8a9c63'),
      colored(new CylinderGeometry(0.27, 0.34, 2.3, 6).translate(1.6, 3.6, 0), '#8a9c63'),
      colored(new CylinderGeometry(0.27, 0.32, 1.5, 6).rotateZ(Math.PI / 2).translate(-0.7, 3.7, 0), '#728753'),
      colored(new CylinderGeometry(0.24, 0.3, 1.7, 6).translate(-1.35, 4.4, 0), '#728753'),
    ];
  } else if (kind === 'shrub') {
    pieces = [colored(new IcosahedronGeometry(1.2, 0).scale(1, 0.7, 1).translate(0, 0.7, 0), '#ffffff'),
      colored(new IcosahedronGeometry(0.85, 0).scale(1, 0.8, 1).translate(0.8, 0.5, 0.4), '#d4dfbd'),
      colored(new IcosahedronGeometry(0.8, 0).scale(1, 0.75, 1).translate(-0.6, 0.5, -0.6), '#c0cda9')];
  } else if (kind === 'rock') {
    pieces = [colored(new IcosahedronGeometry(1.75, 0).scale(1.05, 0.62, 0.8).rotateY(0.3).translate(0, 0.65, 0), '#c1c0ab'),
      colored(new IcosahedronGeometry(0.65, 0).scale(1, 0.7, 1).translate(1.3, 0.25, 0.7), '#989e8e')];
  } else if (kind === 'flowerSpikes') {
    pieces = [];
    for (let i = 0; i < 5; i++) {
      const angle = i * 2.4, x = Math.cos(angle) * 0.4, z = Math.sin(angle) * 0.4, h = 0.65 + i * 0.05;
      pieces.push(colored(new CylinderGeometry(0.013, 0.025, h, 3).translate(x, h / 2, z), '#668246'));
      for (let j = 0; j < 4; j++) pieces.push(colored(new IcosahedronGeometry(0.085 - j * 0.012, 0).scale(1, 1.35, 1)
        .translate(x, h - 0.18 + j * 0.07, z), i % 2 ? '#b8a3ce' : '#817bb1'));
      for (const side of [-1, 1]) pieces.push(colored(new ConeGeometry(0.09, 0.3, 3).rotateZ(side * 0.8).rotateY(angle)
        .translate(x + side * 0.05, 0.22, z), '#829855'));
    }
  } else if (kind === 'meadow' || kind === 'flowers') {
    const vertices: number[] = [];
    for (let i = 0; i < (kind === 'flowers' ? 8 : 22); i++) {
      const angle = i * 2.4, radius = 0.18 + (i % 4) * 0.15, x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
      const h = 0.24 + (i % 5) * 0.065, dx = Math.cos(angle), dz = -Math.sin(angle);
      const a = [x - dx * 0.045, 0, z - dz * 0.045], b = [x + dx * 0.045, 0, z + dz * 0.045];
      const c = [x + dx * 0.025, h * 0.6, z + dz * 0.025], d = [x - dx * 0.07, h, z - dz * 0.07];
      vertices.push(...a, ...b, ...c, ...b, ...a, ...c, ...a, ...c, ...d, ...c, ...a, ...d);
    }
    const blades = new BufferGeometry(); blades.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3)); blades.computeVertexNormals();
    blades.setAttribute('uv', new BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
    pieces = [colored(blades, '#71954b')];
    if (kind === 'flowers') for (let i = 0; i < 4; i++) {
      const x = Math.sin(i * 2.4) * 0.42, z = Math.cos(i * 2.4) * 0.42, height = 0.35 + i * 0.075;
      pieces.push(colored(new CylinderGeometry(0.012, 0.02, height, 3).translate(x, height / 2, z), '#668246'));
      for (let petal = 0; petal < 5; petal++) {
        const angle = petal * Math.PI * 2 / 5;
        pieces.push(colored(new IcosahedronGeometry(0.08, 0).scale(1, 0.35, 1.6).rotateY(angle)
          .translate(x + Math.sin(angle) * 0.07, height, z + Math.cos(angle) * 0.07), ['#f2e5c5', '#e6ba48', '#b3a3d2', '#eee7d4'][i]));
      }
      pieces.push(colored(new IcosahedronGeometry(0.037, 0).translate(x, height + 0.02, z), '#b48b31'));
    }
  } else {
    const vertices: number[] = [];
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.4, x = Math.sin(angle) * 0.52, z = Math.cos(angle) * 0.52, h = 0.55 + (i % 3) * 0.18;
      const a = [x - 0.1, 0.08, z], b = [x + 0.1, 0.08, z], c = [x + Math.cos(angle) * 0.2, h, z + Math.sin(angle) * 0.18];
      vertices.push(...a, ...b, ...c, ...b, ...a, ...c);
    }
    const blades = new BufferGeometry(); blades.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3)); blades.computeVertexNormals();
    blades.setAttribute('uv', new BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
    pieces = [colored(blades, '#ffffff')];
  }
  const normalized = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece), geometry = mergeGeometries(normalized)!;
  for (let i = 0; i < pieces.length; i++) { if (normalized[i] !== pieces[i]) normalized[i].dispose(); pieces[i].dispose(); }
  return geometry;
}
