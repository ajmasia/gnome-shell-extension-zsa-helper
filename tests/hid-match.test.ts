import { describe, expect, it } from 'vitest';
import { hidName, hidProductId, isZsaRawHid } from '../src/core/oryx/hid-match.js';

// Real contents from /sys/class/hidraw/hidraw{3,4,5}/device on a Voyager.
const VOYAGER_UEVENT = 'DRIVER=hid-generic\nHID_ID=0003:00003297:00001977\nHID_NAME=ZSA Technology Labs Voyager\n';
const RAW_HID = new Uint8Array([0x06, 0x60, 0xff, 0x09, 0x61, 0xa1, 0x01, 0x09]);
const KEYBOARD = new Uint8Array([0x05, 0x01, 0x09, 0x06, 0xa1, 0x01, 0x05, 0x07]);
const CONSUMER = new Uint8Array([0x05, 0x01, 0x09, 0x80, 0xa1, 0x01, 0x85, 0x03]);

describe('isZsaRawHid', () => {
    it('accepts the raw HID interface of a ZSA keyboard', () => {
        expect(isZsaRawHid(VOYAGER_UEVENT, RAW_HID)).toBe(true);
    });

    it('rejects the other interfaces of the same keyboard', () => {
        expect(isZsaRawHid(VOYAGER_UEVENT, KEYBOARD)).toBe(false);
        expect(isZsaRawHid(VOYAGER_UEVENT, CONSUMER)).toBe(false);
    });

    it('rejects raw HID interfaces from other vendors', () => {
        const qmkBoard = 'HID_ID=0003:0000FEED:00006060\nHID_NAME=Some QMK board\n';
        expect(isZsaRawHid(qmkBoard, RAW_HID)).toBe(false);
    });

    it('rejects malformed input', () => {
        expect(isZsaRawHid('', RAW_HID)).toBe(false);
        expect(isZsaRawHid(VOYAGER_UEVENT, new Uint8Array([0x06, 0x60]))).toBe(false);
    });
});

describe('hidName', () => {
    it('reads the product name', () => {
        expect(hidName(VOYAGER_UEVENT)).toBe('ZSA Technology Labs Voyager');
        expect(hidName('HID_ID=0003:00003297:00001977')).toBeNull();
    });
});

describe('hidProductId', () => {
    it('reads the product id', () => {
        expect(hidProductId(VOYAGER_UEVENT)).toBe(0x1977);
        expect(hidProductId('HID_NAME=nothing')).toBeNull();
    });
});
