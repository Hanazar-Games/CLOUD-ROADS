import type { TunnelSpan } from './TunnelDetector';

export function tunnelSignalSamples(span: TunnelSpan) {
  return span.samples.filter((sample, i) => i > 0 &&
    (Math.floor(sample.distance / 192) !== Math.floor(span.samples[i - 1].distance / 192)
      || !span.openStart && i === 2 || !span.openEnd && i === span.samples.length - 3));
}
