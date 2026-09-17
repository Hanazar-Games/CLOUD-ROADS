import { TerrainGenerator } from './TerrainGenerator';
import type { TerrainJob, TerrainReply } from './TerrainWorkers';

const scope = self as unknown as {
  onmessage: (event: MessageEvent<TerrainJob>) => void;
  postMessage: (message: TerrainReply, transfer: Transferable[]) => void;
};
let generator: TerrainGenerator;
let seed: string;
scope.onmessage = ({ data: { id, seed: requestedSeed, request, road } }) => {
  try {
    if (!generator || seed !== requestedSeed) {
      seed = requestedSeed;
      generator = new TerrainGenerator(seed);
    }
    const data = generator.generate(request.x, request.z, request.cells, road);
    scope.postMessage({ id, data }, [data.positions.buffer, data.normals.buffer, data.colors.buffer]);
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) }, []);
  }
};
