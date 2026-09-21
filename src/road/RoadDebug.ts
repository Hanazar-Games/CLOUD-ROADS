import { BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, Line, LineBasicMaterial, Points, PointsMaterial, type Scene } from 'three';
import { MAX_ROAD_SEGMENTS, type RoadSpine } from './RoadSpine';
import { ROAD_SAMPLES } from './RoadSegment';

export class RoadDebug {
  readonly group = new Group();
  private readonly line = new Line(new BufferGeometry(), new LineBasicMaterial({ color: 0xe1efbb, depthTest: false, transparent: true, opacity: 0.85 }));
  private readonly points = new Points(new BufferGeometry(), new PointsMaterial({ color: 0xffbd76, size: 5, sizeAttenuation: false, depthTest: false }));
  private version = -1;
  private anchorX = 0;
  private anchorZ = 0;
  enabled = false;

  constructor(scene: Scene) {
    this.line.geometry.setAttribute('position', new BufferAttribute(new Float32Array((MAX_ROAD_SEGMENTS * ROAD_SAMPLES + 1) * 3), 3).setUsage(DynamicDrawUsage));
    this.points.geometry.setAttribute('position', new BufferAttribute(new Float32Array((MAX_ROAD_SEGMENTS + 1) * 3), 3).setUsage(DynamicDrawUsage));
    this.line.geometry.setDrawRange(0, 0);
    this.points.geometry.setDrawRange(0, 0);
    this.line.renderOrder = 5;
    this.points.renderOrder = 6;
    this.group.add(this.line, this.points);
    scene.add(this.group);
  }

  update(spine: Pick<RoadSpine, 'version' | 'segments' | 'samples'>, originX: number, originZ: number, nearRoute: boolean): void {
    if (this.version !== spine.version && spine.segments.length) {
      this.version = spine.version;
      const first = spine.segments[0].start.position;
      this.anchorX = first.x;
      this.anchorZ = first.z;
      const line = this.line.geometry.getAttribute('position') as BufferAttribute;
      const points = this.points.geometry.getAttribute('position') as BufferAttribute;
      for (const [index, sample] of spine.samples.entries()) {
        line.setXYZ(index, sample.position.x - first.x, sample.position.y + 0.15, sample.position.z - first.z);
      }
      for (const [i, segment] of spine.segments.entries()) {
        points.setXYZ(i, segment.start.position.x - first.x, segment.start.position.y + 0.2, segment.start.position.z - first.z);
      }
      const last = spine.segments.at(-1)!.end.position;
      points.setXYZ(spine.segments.length, last.x - first.x, last.y + 0.2, last.z - first.z);
      for (const object of [this.line, this.points]) {
        object.geometry.getAttribute('position').needsUpdate = true;
        object.geometry.computeBoundingSphere();
      }
      this.line.geometry.setDrawRange(0, spine.samples.length);
      this.points.geometry.setDrawRange(0, spine.segments.length + 1);
    }
    this.group.position.set(this.anchorX - originX, 0, this.anchorZ - originZ);
    this.group.visible = this.enabled && nearRoute;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const object of [this.line, this.points]) { object.geometry.dispose(); object.material.dispose(); }
  }
}
