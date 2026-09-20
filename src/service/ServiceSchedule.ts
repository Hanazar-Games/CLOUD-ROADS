import { hashSeed } from '../world/WorldSeed';

export const SERVICE_SEARCH_RADIUS = 840;
export const serviceTarget = (seed: string, id: number): number => id * 15000 + (hashSeed(`${seed}:services:${id}`) % 3601) - 1800;
