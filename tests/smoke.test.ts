import { describe, expect, it } from 'vitest';
import { EXTENSION_NAME } from '../src/core/index.js';

describe('core', () => {
    it('exposes the extension name', () => {
        expect(EXTENSION_NAME).toBe('zsa-helper');
    });
});
