import { describe, expect, it } from 'vitest';
import {
    buildLayoutRequest,
    isValidHashId,
    keymappRevisionQuery,
    OryxApiError,
    parseLayoutResponse,
} from '../src/core/layout/oryx-query.js';
import { layoutFromOryxJson } from '../src/core/layout/from-oryx.js';
import { readFixture } from './helpers.js';

describe('isValidHashId', () => {
    it('accepts Oryx hashes and rejects anything else', () => {
        expect(isValidHashId('aOa9o')).toBe(true);
        expect(isValidHashId('nlzDl9')).toBe(true);
        expect(isValidHashId('')).toBe(false);
        expect(isValidHashId("x' OR 1=1 --")).toBe(false);
        expect(isValidHashId('../etc')).toBe(false);
    });
});

describe('buildLayoutRequest', () => {
    it('asks for the revision of a Voyager layout', () => {
        const body = JSON.parse(buildLayoutRequest('aOa9o', 'nlzDl9'));
        expect(body.variables).toEqual({ hashId: 'aOa9o', revisionId: 'nlzDl9', geometry: 'voyager' });
        expect(body.query).toContain('layers { title position color keys }');
    });

    it('rejects invalid ids', () => {
        expect(() => buildLayoutRequest('aOa9o', 'bad id')).toThrow(RangeError);
    });
});

describe('parseLayoutResponse', () => {
    it('returns a response that normalises into a layout', () => {
        const json = parseLayoutResponse(readFixture('oryx-graphql-aOa9o-nlzDl9.json'));
        expect(layoutFromOryxJson(json).revisionId).toBe('nlzDl9');
    });

    it('reports GraphQL errors, missing layouts and invalid JSON', () => {
        expect(() => parseLayoutResponse('{"errors":[{"message":"boom"}]}')).toThrow(/boom/);
        expect(() => parseLayoutResponse('{"data":{"layout":null}}')).toThrow(OryxApiError);
        expect(() => parseLayoutResponse('<html>')).toThrow(/invalid JSON/);
    });
});

describe('keymappRevisionQuery', () => {
    it('selects the revision by id', () => {
        expect(keymappRevisionQuery('nlzDl9')).toBe("SELECT data FROM revision WHERE revisionId = 'nlzDl9' LIMIT 1;");
    });

    it('refuses ids that could inject SQL', () => {
        expect(() => keymappRevisionQuery("x'; DROP TABLE revision; --")).toThrow(RangeError);
    });
});
