import { PerspectiveCamera, Scene, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { DrivingCamera, drivingViews } from '../src/camera/DrivingCamera';
import { VehicleMesh } from '../src/vehicle/VehicleMesh';
import { VehiclePhysics } from '../src/vehicle/VehiclePhysics';
import type { DrivingSurface } from '../src/vehicle/DrivingSurface';

describe('Driving rendering', () => {
  it('preserves every camera and the vehicle through repeated floating origin shifts', () => {
    const camera = new PerspectiveCamera(), rig = new DrivingCamera(camera), car = new VehiclePhysics(), scene = new Scene();
    const mesh = new VehicleMesh(scene);
    const surface = { sample: () => ({ height: 100, grip: 1 }), inTunnel: () => false } as unknown as DrivingSurface;
    car.reset(30000, -42000, 0.6, surface.sample);
    for (const view of drivingViews) {
      rig.view = view; rig.reset();
      rig.update(0, car, surface, { x: 0, z: 0 }, [0, 0]);
      mesh.sync(car, { x: 0, z: 0 }, 1);
      const position = camera.position.clone(), rotation = camera.quaternion.clone(), vehicle = mesh.root.position.clone();
      const origin = { x: 29952, z: -41984 };
      rig.update(1 / 60, car, surface, origin, [0, 0]); mesh.sync(car, origin, 1);
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
