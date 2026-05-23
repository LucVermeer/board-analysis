import { describe, it, expect } from 'vitest';
import { splitMessages, MAX_BLUETOOTH_MESSAGE_SIZE } from '../transport';

describe('splitMessages', () => {
  it('splits a buffer larger than 20 bytes into chunks', () => {
    const buffer = new Uint8Array(50);
    for (let byteIndex = 0; byteIndex < 50; byteIndex++) buffer[byteIndex] = byteIndex;

    const chunks = splitMessages(buffer);
    expect(chunks).toHaveLength(3); // ceil(50/20) = 3
    expect(chunks[0].length).toBe(MAX_BLUETOOTH_MESSAGE_SIZE);
    expect(chunks[1].length).toBe(MAX_BLUETOOTH_MESSAGE_SIZE);
    expect(chunks[2].length).toBe(10); // remaining
  });

  it('returns a single chunk for data smaller than 20 bytes', () => {
    const buffer = new Uint8Array(10);
    const chunks = splitMessages(buffer);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBe(10);
  });

  it('returns a single chunk for exactly 20 bytes', () => {
    const buffer = new Uint8Array(MAX_BLUETOOTH_MESSAGE_SIZE);
    const chunks = splitMessages(buffer);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].length).toBe(MAX_BLUETOOTH_MESSAGE_SIZE);
  });

  it('returns an empty array for empty buffer', () => {
    const buffer = new Uint8Array(0);
    const chunks = splitMessages(buffer);
    expect(chunks).toHaveLength(0);
  });

  it('preserves data content across chunks', () => {
    const buffer = new Uint8Array(25);
    for (let byteIndex = 0; byteIndex < 25; byteIndex++) buffer[byteIndex] = byteIndex;

    const chunks = splitMessages(buffer);
    const reassembled = new Uint8Array(25);
    let offset = 0;
    for (const chunk of chunks) {
      reassembled.set(chunk, offset);
      offset += chunk.length;
    }
    expect(reassembled).toEqual(buffer);
  });
});
