import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop } from '../src/game/GameLoop';

afterEach(() => vi.unstubAllGlobals());

describe('GameLoop', () => {
  it('starts once, clamps background-tab gaps, and resets timing after restart', () => {
    let callback: FrameRequestCallback = () => {};
    const request = vi.fn((cb: FrameRequestCallback) => { callback = cb; return 1; });
    const cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', request);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const update = vi.fn();
    const loop = new GameLoop(update);
    loop.start();
    loop.start();
    expect(request).toHaveBeenCalledTimes(1);
    callback(1000);
    callback(1016);
    callback(61016);
    expect(update.mock.calls.map(([dt]) => dt)).toEqual([0, 0.016, 0.05]);
    loop.stop();
    callback(62000);
    expect(update).toHaveBeenCalledTimes(3);
    expect(cancel).toHaveBeenCalledWith(1);
    loop.start();
    callback(70000);
    expect(update).toHaveBeenLastCalledWith(0);
    loop.stop();
  });
});
