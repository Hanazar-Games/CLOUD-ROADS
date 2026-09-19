import { TerrainGenerator } from './TerrainGenerator';
import type { TerrainJob, TerrainReply } from './TerrainWorkers';

const scope = self as unknown as {
  onmessage: (event: MessageEvent<TerrainJob>) => void;
  postMessage: (message: TerrainReply, transfer: Transferable[]) => void;
};
let generator: TerrainGenerator;
let key: string;
scope.onmessage = ({ data: { id, seed, request, road, services, options } }) => {
  try {
    const requestedKey = JSON.stringify([seed, options]);
    if (!generator || key !== requestedKey) {
      key = requestedKey;
      generator = new TerrainGenerator(seed, options);
    }
    const data = generator.generate(request.x, request.z, request.cells, road, services);
    scope.postMessage({ id, data }, [data.positions.buffer, data.normals.buffer, data.colors.buffer, data.vegetation.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
