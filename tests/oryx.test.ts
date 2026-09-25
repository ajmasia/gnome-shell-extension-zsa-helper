import { describe, expect, it } from 'vitest';
import { buildCommand, CMD_GET_PROTOCOL_VERSION, CMD_PAIRING_INIT } from '../src/core/oryx/commands.js';
import { parseOryxPacket } from '../src/core/oryx/parse.js';

/** Pads a packet to a full 32-byte report, as the keyboard sends it. */
function report(...bytes: number[]): Uint8Array {
    const buffer = new Uint8Array(32);
    buffer.set(bytes);
    return buffer;
}

const ascii = (text: string): number[] => [...text].map(c => c.charCodeAt(0));

describe('parseOryxPacket', () => {
    it('parses the protocol version', () => {
        expect(parseOryxPacket(report(0xfe, 0x05, 0xfe))).toEqual({ type: 'protocol-version', version: 5 });
    });

    it('parses the firmware version as layout and revision ids', () => {
        expect(parseOryxPacket(report(0x00, ...ascii('aOa9o/nlzDl9'), 0xfe))).toEqual({
            type: 'fw-version',
            raw: 'aOa9o/nlzDl9',
            layoutId: 'aOa9o',
            revisionId: 'nlzDl9',
        });
    });

    it('keeps the raw firmware version when it is not an Oryx id', () => {
        expect(parseOryxPacket(report(0x00, ...ascii('custom'), 0xfe))).toMatchObject({
            raw: 'custom',
            layoutId: null,
            revisionId: null,
        });
    });

    it('parses pairing success', () => {
        expect(parseOryxPacket(report(0x04, 0xfe))).toEqual({ type: 'pairing-success' });
    });

    it('parses layer changes', () => {
        expect(parseOryxPacket(report(0x05, 0x02, 0xfe))).toEqual({ type: 'layer', layer: 2 });
    });

    it('reads key events as column first, then row', () => {
        expect(parseOryxPacket(report(0x06, 0x04, 0x08, 0xfe))).toEqual({ type: 'keydown', row: 8, col: 4 });
        expect(parseOryxPacket(report(0x07, 0x02, 0x00, 0xfe))).toEqual({ type: 'keyup', row: 0, col: 2 });
    });

    it('parses errors and unknown events', () => {
        expect(parseOryxPacket(report(0xff, 0x04))).toEqual({ type: 'error', code: 4 });
        expect(parseOryxPacket(report(0x42))).toEqual({ type: 'unknown', code: 0x42 });
    });

    it('treats truncated packets as unknown', () => {
        expect(parseOryxPacket(new Uint8Array([0x06, 0x04]))).toEqual({ type: 'unknown', code: 0x06 });
        expect(parseOryxPacket(new Uint8Array([]))).toEqual({ type: 'unknown', code: -1 });
    });
});

describe('buildCommand', () => {
    it('prefixes the report id and pads to 33 bytes', () => {
        const command = buildCommand(CMD_PAIRING_INIT);
        expect(command).toHaveLength(33);
        expect([...command.slice(0, 3)]).toEqual([0x00, 0x01, 0x00]);
    });

    it('includes parameters after the command', () => {
        expect([...buildCommand(CMD_GET_PROTOCOL_VERSION, 7, 8).slice(0, 4)]).toEqual([0x00, 0xfe, 7, 8]);
    });

    it('rejects more parameters than fit in a report', () => {
        expect(() => buildCommand(CMD_PAIRING_INIT, ...new Array(32).fill(0))).toThrow(RangeError);
    });
});
