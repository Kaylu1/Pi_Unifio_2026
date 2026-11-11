import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
export const timestamp = () => new Date().toISOString();
export const hashToken = (token: any) => createHash('sha256').update(token).digest('hex');
export function hashPassword(password: any) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; }
export function verifyPassword(password: any, encoded: any = '') { const [salt, hash] = encoded.split(':'); if (!salt || !hash) {
    scryptSync(String(password), 'invalid-account', 64);
    return false;
} const actual = scryptSync(String(password), salt, 64), expected = Buffer.from(hash, 'hex'); return actual.length === expected.length && timingSafeEqual(actual, expected); }
