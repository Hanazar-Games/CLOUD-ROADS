import type { Group } from 'three';
import type { VehicleProfile } from './VehicleConfig';
import type { VehicleDetailKit } from './VehicleDetails';
import type { VehicleFittings } from './VehicleFittings';

export function fleetBody(p: VehicleProfile, parent: Group, kit: VehicleDetailKit, fittings: VehicleFittings, rideHeight: number): void {
  if (!p.body) return;
  const { block, cylinder, paint, trim, metal, glass, amber, lamp } = kit;
  const end = p.length / 2, top = p.height - rideHeight - (p.body === 'expedition' ? 0.4 : 0), start = -end + (p.length > 6 ? 2.65 : 2.15);
  const length = end - start, middle = (start + end) / 2, w = p.width;
  if (p.body === 'coupe' || p.body === 'rally') {
    for (const side of [-1, 1]) {
      block(0.11, 0.12, p.length - 0.65, side * (w / 2 - 0.02), -0.25, 0, trim, parent);
      block(0.08, 0.3, 0.13, side * w * 0.32, top * 0.62, end - 0.35, metal, parent);
    }
    block(w * 0.91, 0.06, 0.3, 0, top * 0.62 + 0.16, end - 0.35, trim, parent);
    if (p.body === 'rally') {
      for (const x of [-0.6, -0.2, 0.2, 0.6]) {
        const light = cylinder(0.12, 0.08, x, 0.19, -end - 0.08, lamp, parent); light.rotation.x = Math.PI / 2;
      }
      block(w * 0.72, 0.11, 0.08, 0, 0.2, -end - 0.02, metal, parent);
      block(0.65, 0.07, 0.44, 0, top + 0.02, 0, trim, parent);
      for (const side of [-1, 1]) for (const z of [-0.65, 0.75]) block(0.07, top - 0.25, 0.07, side * w * 0.35, top / 2, z, metal, parent);
    }
  } else if (p.body === 'limousine') {
    for (const side of [-1, 1]) {
      block(0.035, 0.035, p.length - 0.4, side * w / 2, 0.2, 0, metal, parent);
      for (const z of [-0.55, 0.8, 2.15]) {
        block(0.06, top - 0.2, 0.075, side * (w / 2 - 0.065), (top + 0.2) / 2, z, trim, parent);
        block(0.025, 0.045, 0.22, side * (w / 2 + 0.02), 0.12, z - 0.18, metal, parent);
      }
    }
    block(w * 0.8, 0.018, 0.04, 0, top - 0.15, -0.5, metal, parent);
    block(0.42, 0.035, 1.1, 0, top + 0.005, 0.8, glass, parent);
  } else if (p.body === 'expedition') {
    block(w - 0.25, 0.08, p.length - 2.2, 0, top + 0.04, 0.5, trim, parent);
    for (const side of [-1, 1]) block(0.06, 0.18, p.length - 2.3, side * (w / 2 - 0.17), top + 0.13, 0.5, metal, parent);
    for (const z of [-1.1, 1.1]) block(w - 0.32, 0.18, 0.06, 0, top + 0.13, z, metal, parent);
    block(0.9, 0.32, 0.75, -0.35, top + 0.24, 0.5, paint, parent);
    const spare = cylinder(p.radius, 0.23, 0, 0.45, end + 0.03, trim, parent); spare.rotation.x = Math.PI / 2;
    block(w + 0.08, 0.14, 0.18, 0, -0.2, -end - 0.03, metal, parent);
  } else if (p.body === 'schoolbus' || p.body === 'shuttle') {
    for (const side of [-1, 1]) for (const y of [0.26, 0.42]) block(0.045, 0.045, p.length - 0.6, side * w / 2, y, 0, trim, parent);
    block(w * 0.58, 0.26, 0.055, 0, top - 0.23, -end - 0.025, trim, parent);
    for (const side of [-1, 1]) block(0.15, 0.12, 0.06, side * w * 0.4, top - 0.2, -end - 0.035, amber, parent);
    if (p.body === 'schoolbus') {
      const sign = fittings.hinge('aux', parent, -w / 2 - 0.035, 0.7, -end + 2, 'y', Math.PI / 2);
      block(0.065, 0.55, 0.55, 0, 0, 0.27, amber, sign);
      block(0.075, 0.08, 0.4, 0, 0, 0.27, metal, sign);
    } else {
      block(w * 0.75, 0.12, 1.1, 0, top - 0.01, 0.4, trim, parent);
      for (let z = 0; z <= 0.8; z += 0.15) block(w * 0.66, 0.035, 0.045, 0, top + 0.06, z, metal, parent);
    }
  } else if (p.body === 'mixer') {
    const radius = w * 0.44, center = middle - 0.15, tilt = Math.PI / 2 - 0.15;
    for (const [offset, span, front, back] of [[-1.45, 0.9, radius, radius * 0.6], [0, 2, radius, radius], [1.6, 1.2, radius * 0.42, radius]]) {
      const drum = cylinder(front, span, 0, top * 0.5 + offset * Math.sin(0.15), center + offset * Math.cos(0.15), paint, parent, back);
      drum.rotation.x = tilt;
    }
    for (const offset of [-0.65, 0.65]) {
      const stripe = cylinder(radius + 0.012, 0.16, 0, top * 0.5 + offset * Math.sin(0.15), center + offset * Math.cos(0.15), metal, parent);
      stripe.rotation.x = tilt;
    }
    for (const z of [start + 0.6, end - 1.05]) {
      block(w * 0.82, 0.18, 0.3, 0, 0.15, z, metal, parent);
      block(0.32, 0.35, 0.32, 0, 0.36, z, trim, parent);
    }
    block(0.85, 0.65, 0.7, 0, top - 0.35, end - 0.45, metal, parent);
    const chute = fittings.hinge('aux', parent, 0, 0.55, end - 0.65, 'y', 0.8);
    block(0.42, 0.09, 0.85, 0, -0.1, 0.4, metal, chute);
    for (const x of [-0.22, 0.22]) block(0.045, 0.18, 0.85, x, -0.03, 0.4, paint, chute);
    for (let y = 0.2; y < top; y += 0.28) block(0.48, 0.055, 0.08, w * 0.34, y, end - 0.05, metal, parent);
  } else if (p.body === 'refrigerated') {
    block(w * 0.7, 0.6, 0.22, 0, top - 0.36, start - 0.1, metal, parent);
    for (let x = -0.6; x <= 0.6; x += 0.15) block(0.05, 0.4, 0.24, x, top - 0.36, start - 0.11, trim, parent);
    for (const side of [-1, 1]) {
      block(0.05, 0.2, length - 0.4, side * w / 2, 0.95, middle, metal, parent);
      for (let z = start + 0.3; z < end - 0.2; z += 0.3) block(0.045, top - 0.75, 0.018, side * w / 2, (top + 0.65) / 2, z, metal, parent);
    }
  } else if (p.body === 'garbage') {
    for (const side of [-1, 1]) {
      for (let z = start + 0.5; z < end - 0.5; z += 0.7) block(0.09, top - 0.65, 0.1, side * w / 2, (top + 0.65) / 2, z, metal, parent);
      block(0.16, 0.6, 0.45, side * w * 0.33, 0.55, end + 0.12, trim, parent);
    }
    block(w * 0.78, 0.12, 0.5, 0, 0.22, end + 0.05, metal, parent);
    block(0.7, 0.22, 0.4, 0, top + 0.04, start + 0.2, amber, parent);
  } else if (p.body === 'towtruck') {
    block(w * 0.66, 0.18, 0.16, 0, top + 0.04, start - 0.45, amber, parent);
    const winch = cylinder(0.22, 0.8, 0, 0.62, start + 0.35, metal, parent); winch.rotation.z = Math.PI / 2;
    block(0.035, 0.035, 1.6, 0, 0.63, start + 1.25, metal, parent);
    for (const x of [-0.55, 0.55]) block(0.55, 0.14, 0.38, x, 0.4, middle, trim, parent);
  } else if (p.body === 'hatchback' || p.body === 'wagon') {
    block(w * 0.86, 0.055, 0.22, 0, top - 0.04, end - 0.24, trim, parent);
    block(0.04, 0.025, 0.45, 0, top * 0.62, end - 0.13, metal, parent);
    if (p.body === 'wagon') for (const z of [-0.2, 1.2]) block(w * 0.86, 0.04, 0.06, 0, top + 0.055, z, metal, parent);
  } else if (p.body === 'pickup') {
    block(w - 0.2, 0.09, end - 0.45, 0, -0.2, (end + 0.45) / 2, trim, parent);
    for (const x of [-1, 1]) {
      block(0.08, 0.09, end - 0.35, x * (w / 2 - 0.06), 0.24, (end + 0.35) / 2, trim, parent);
      block(0.09, 0.55, 0.08, x * w * 0.37, 0.5, 0.58, metal, parent);
    }
    block(w * 0.76, 0.08, 0.08, 0, 0.78, 0.58, metal, parent);
    const gate = fittings.hinge('cargo', parent, 0, -0.17, end - 0.08, 'x', Math.PI / 2);
    block(w - 0.15, 0.38, 0.08, 0, 0.19, 0, paint, gate);
    block(0.28, 0.05, 0.09, 0, 0.3, 0.02, metal, gate);
  } else if (p.body === 'tanker') {
    const radius = Math.min(w * 0.44, (top - 0.35) / 2);
    const tank = cylinder(radius, length - 0.3, 0, 0.3 + radius, middle, metal, parent); tank.rotation.x = Math.PI / 2;
    for (const z of [start + 0.25, middle, end - 0.25]) {
      block(w - 0.15, 0.17, 0.18, 0, 0.12, z, trim, parent);
      cylinder(0.22, 0.1, 0, 0.38 + radius * 2, z, paint, parent);
    }
    for (const x of [-0.65, 0.65]) block(0.07, 0.1, length - 0.3, x, 0.3 + radius * 2, middle, metal, parent);
    for (let y = 0.1; y < top - 0.2; y += 0.28) block(0.55, 0.05, 0.05, 0, y, end - 0.03, metal, parent);
    for (const x of [-0.3, 0.3]) block(0.05, top - 0.25, 0.05, x, (top - 0.25) / 2, end - 0.03, metal, parent);
  } else if (p.body === 'dumptruck') {
    const bed = fittings.hinge('cargo', parent, 0, 0.28, end - 0.1, 'x', 0.72), l = length - 0.15, h = top - 0.45;
    block(w - 0.12, 0.16, l, 0, 0, -l / 2, paint, bed);
    for (const x of [-1, 1]) {
      block(0.1, h, l, x * (w / 2 - 0.06), h / 2, -l / 2, paint, bed);
      for (let z = -l + 0.2; z < 0; z += 0.65) block(0.13, h, 0.07, x * (w / 2 - 0.03), h / 2, z, metal, bed);
    }
    for (const z of [-l, 0]) block(w - 0.12, h, 0.1, 0, h / 2, z, paint, bed);
    block(w - 0.05, 0.08, 0.55, 0, h, -l + 0.12, paint, bed);
  } else if (p.body === 'firetruck') {
    block(w - 0.1, top - 0.42, length, 0, (top + 0.12) / 2, middle, paint, parent);
    for (const side of [-1, 1]) for (let z = start + 0.55; z < end - 0.25; z += 1.2) {
      block(0.055, 1.05, 1.04, side * w / 2, 1, z, metal, parent);
      for (let y = 0.5; y < 1.5; y += 0.12) block(0.065, 0.025, 1, side * (w / 2 + 0.005), y, z, trim, parent);
      block(0.08, 0.04, 0.35, side * (w / 2 + 0.025), 0.58, z, trim, parent);
    }
    for (const x of [-0.43, 0.43]) block(0.09, 0.12, length - 0.25, x, top - 0.04, middle, metal, parent);
    for (let z = start + 0.25; z < end - 0.1; z += 0.32) block(0.86, 0.065, 0.06, 0, top - 0.02, z, metal, parent);
    for (const side of [-1, 1]) block(0.06, 0.15, length, side * w / 2, 0.35, middle, amber, parent);
  } else if (p.body === 'citybus') {
    block(w * 0.7, 0.23, 0.04, 0, top - 0.28, -end - 0.02, trim, parent);
    for (let x = -0.6; x <= 0.6; x += 0.15) block(0.07, 0.08, 0.046, x, top - 0.28, -end - 0.02, amber, parent);
    for (const side of [-1, 1]) block(0.075, 0.14, p.length - 1.6, side * w / 2, 0.24, 0.5, metal, parent);
    for (const z of [-1.5, 0.5, 2.5]) {
      block(0.035, 1.35, 0.035, -0.25, p.eye.y - 0.1, z, amber, parent);
      block(0.035, 0.035, 1.8, -0.25, p.eye.y + 0.53, z, amber, parent);
    }
  } else {
    for (const side of [-1, 1]) {
      block(0.07, 0.14, length - 0.2, side * w / 2, 0.87, middle, p.body === 'ambulance' ? amber : metal, parent);
      if (p.body !== 'van') for (const z of [middle - 0.6, middle + 0.8]) {
        block(0.075, 0.66, 0.86, side * w / 2, top - 0.65, z, trim, parent);
        block(0.08, 0.55, 0.75, side * w / 2, top - 0.65, z, glass, parent);
      }
      if (p.body === 'ambulance') {
        block(0.09, 0.55, 0.14, side * w / 2, 1.3, start + 0.5, amber, parent);
        block(0.09, 0.14, 0.55, side * w / 2, 1.3, start + 0.5, amber, parent);
      }
      if (p.body === 'van') for (const z of [start + 0.05, middle + 0.3]) block(0.08, top - 0.7, 0.022, side * w / 2, (top + 0.7) / 2, z, trim, parent);
    }
    if (p.body === 'camper') {
      block(w - 0.1, 0.35, 1.5, 0, top - 0.13, start - 0.7, paint, parent);
      block(0.16, 0.14, length - 0.3, w / 2 + 0.04, top - 0.18, middle, trim, parent);
      block(0.6, 0.025, 0.7, 0, top + 0.055, middle, glass, parent);
    }
  }
}
