import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DrivingCamera, drivingViews } from '../src/camera/DrivingCamera';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehicleSystems } from '../src/vehicle/VehicleSystems';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import type { DrivingSurface } from '../src/vehicle/DrivingSurface';

describe('Driving rendering', () => {
  it('frames the whole long rig and uses its cab inside a tunnel', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics('semi20');
    let inside = false;
    const surface = { sample: () => ({ height: 0, grip: 1 }), inTunnel: () => inside } as unknown as DrivingSurface;
    car.reset(0, 0, 0, surface.sample);
    rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.position.z).toBeGreaterThan(20);
    inside = true; rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.position.z).toBeLessThan(0);
    expect(camera.position.y).toBeGreaterThan(2.5);
    expect(camera.position.y).toBeLessThan(3.5);
  });
  it('previews height and distance changes without moving the parked car or resetting the look direction', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics();
    const surface = { sample: () => ({ height: 0, grip: 1 }), inTunnel: () => false } as unknown as DrivingSurface;
    car.reset(0, 0, 0, surface.sample);
    rig.view = 'hood'; rig.update(0, car, surface, { x: 0, z: 0 }, [100, 0]);
    const before = camera.position.clone(), rotation = camera.quaternion.clone();
    rig.height = 0.25;
    rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.position.y - before.y).toBeCloseTo(0.25);
    expect(camera.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
    rig.view = 'chase'; rig.reset(); rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    rig.distance = 10; rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.position.z).toBeCloseTo(10);
    expect(car.x).toBe(0); expect(car.z).toBe(0);
  });

  it('filters first-person suspension rotation while continuing to follow the car position', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics();
    const surface = { sample: () => ({ height: 0, grip: 1 }), inTunnel: () => false } as unknown as DrivingSurface;
    car.reset(0, 0, 0, surface.sample); rig.view = 'cockpit';
    rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    const before = camera.quaternion.clone();
    car.pitch = 0.2; car.roll = 0.15; car.z = -10;
    rig.update(1 / 60, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.quaternion.angleTo(before)).toBeLessThan(0.08);
    expect(camera.position.z).toBeLessThan(-9);
    for (let frame = 0; frame < 120; frame++) rig.update(1 / 60, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.rotation.x).toBeCloseTo(car.pitch, 3);
  });

  it('retracts the chase camera when a ridge blocks the line of sight', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics();
    const surface = { sample: (_x: number, z: number) => ({ height: z > 3 && z < 6 ? 5 : 0, grip: 1 }), inTunnel: () => false } as unknown as DrivingSurface;
    car.reset(0, 0, 0, surface.sample);
    rig.distance = 10; rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.position.z).toBeLessThanOrEqual(3);
    expect(camera.position.y).toBeGreaterThan(surface.sample(camera.position.x, camera.position.z).height);
  });

  it('preserves every camera and the vehicle through repeated floating origin shifts', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics(), scene = new Scene();
    const mesh = new VehicleMesh(scene);
    const surface = { sample: () => ({ height: 100, grip: 1 }), inTunnel: () => false } as unknown as DrivingSurface;
    car.reset(30000, -42000, 0.6, surface.sample);
    for (const view of drivingViews) {
      rig.view = view; rig.reset();
      rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
      mesh.sync(car, { x: 0, z: 0 }, new VehicleSystems());
      const position = camera.position.clone(), rotation = camera.quaternion.clone(), vehicle = mesh.root.position.clone();
      const origin = { x: 29952, z: -41984 };
      rig.update(1 / 60, car, surface, origin, [0, 0]); mesh.sync(car, origin, new VehicleSystems());
      expect(camera.position.clone().add(new Vector3(origin.x, 0, origin.z)).distanceTo(position)).toBeLessThan(1e-8);
      expect(camera.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
      expect(mesh.root.position.clone().add(new Vector3(origin.x, 0, origin.z)).distanceTo(vehicle)).toBe(0);
    }
    mesh.dispose(); expect(scene.children).toHaveLength(0);
  });

  it('shortens the chase view before a tunnel and applies the chosen field of view', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics();
    let inside = false;
    const surface = { sample: () => ({ height: 0, grip: 1 }), inTunnel: () => inside } as unknown as DrivingSurface;
    car.reset(0, 0, 0, surface.sample); rig.fov = 85; rig.distance = 11;
    rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
    expect(camera.position.z).toBe(11); expect(camera.fov).toBe(85);
    inside = true; rig.update(1 / 60, car, surface, { x: 0, z: 0 }, [2000, 1000]);
    expect(Math.hypot(camera.position.x, camera.position.z)).toBeLessThan(5);
    expect(camera.position.y).toBeLessThan(3);
    expect(Math.abs(camera.position.x)).toBeLessThan(1);
  });
});
