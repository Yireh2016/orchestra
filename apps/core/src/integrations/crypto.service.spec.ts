import { describe, it, expect, beforeEach } from 'vitest';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  beforeEach(() => {
    const mockConfigService = {
      get: (key: string) => {
        if (key === 'ENCRYPTION_KEY') return 'test-encryption-key-32chars!!';
        return undefined;
      },
    };
    service = new CryptoService(mockConfigService as any);
  });

  describe('encrypt() + decrypt() roundtrip', () => {
    it('should return original text after encrypt then decrypt', () => {
      const plaintext = 'my-secret-api-key-12345';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string', () => {
      const encrypted = service.encrypt('');
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe('');
    });

    it('should handle unicode text', () => {
      const plaintext = 'secret-key-\u00e9\u00e0\u00fc-\ud83d\ude80';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'x'.repeat(10000);
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('encrypt()', () => {
    it('should return different ciphertext for same input (random IV)', () => {
      const plaintext = 'same-input-value';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should produce output in iv:authTag:ciphertext format', () => {
      const encrypted = service.encrypt('test');
      const parts = encrypted.split(':');

      expect(parts).toHaveLength(3);
      // IV: 16 bytes = 32 hex chars
      expect(parts[0]).toHaveLength(32);
      // Auth tag: 16 bytes = 32 hex chars
      expect(parts[1]).toHaveLength(32);
      // Ciphertext should be non-empty hex
      expect(parts[2].length).toBeGreaterThan(0);
    });
  });

  describe('decrypt()', () => {
    it('should throw on tampered ciphertext', () => {
      const encrypted = service.encrypt('secret');
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${parts[1]}:ff${parts[2].slice(2)}`;
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw on tampered auth tag', () => {
      const encrypted = service.encrypt('secret');
      const parts = encrypted.split(':');
      const tampered = `${parts[0]}:${'00'.repeat(16)}:${parts[2]}`;
      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw on invalid format (missing parts)', () => {
      expect(() => service.decrypt('just-a-string')).toThrow();
    });

    it('should throw on invalid format (empty string)', () => {
      expect(() => service.decrypt('')).toThrow();
    });

    it('should throw on invalid hex values', () => {
      expect(() => service.decrypt('zzzz:yyyy:xxxx')).toThrow();
    });
  });
});
