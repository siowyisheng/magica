import { describe, expect, it } from 'vitest';
import { sha256Hex } from './sha256';

// Standard test vectors (FIPS 180-2 / NIST).
describe('sha256Hex', () => {
  it('hashes the empty string', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('hashes a two-block message', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('treats non-ASCII text as UTF-8 and separates near-identical inputs', () => {
    expect(sha256Hex('é')).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('é')).not.toBe(sha256Hex('e'));
    expect(sha256Hex('1|p1|3|salt')).not.toBe(sha256Hex('1|p1|4|salt'));
  });
});
