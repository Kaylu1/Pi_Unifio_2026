import type { WorkshopRepository } from '../contracts.ts';

export class SecurityRepository {
  private store: WorkshopRepository;
  constructor(store: WorkshopRepository) { this.store = store; }

  async passwordHash(userId: number): Promise<string | undefined> {
    return (await this.store.db.prepare('SELECT passwordHash FROM users WHERE id=?').get(userId))?.passwordHash;
  }
  async createSession(token: string, userId: number, csrf: string): Promise<void> {
    await this.store.db.prepare('INSERT INTO sessions(token,userId,csrf,lastSeen) VALUES(?,?,?,?)').run(token, userId, csrf, Date.now());
  }
  async session(token: string): Promise<any> {
    return this.store.db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  }
  async deleteSession(token: string): Promise<void> {
    await this.store.db.prepare('DELETE FROM sessions WHERE token=?').run(token);
  }
  async touchSession(token: string): Promise<void> {
    await this.store.db.prepare('UPDATE sessions SET lastSeen=? WHERE token=?').run(Date.now(), token);
  }
  async deleteUserSessions(userId: number): Promise<void> {
    await this.store.db.prepare('DELETE FROM sessions WHERE userId=?').run(userId);
  }
  async resetToken(token: string): Promise<any> {
    return this.store.db.prepare('SELECT * FROM reset_tokens WHERE token=?').get(token);
  }
  async createResetToken(token: string, userId: number, expiresAt: number): Promise<void> {
    await this.store.db.prepare('INSERT INTO reset_tokens(token,userId,expiresAt) VALUES(?,?,?)').run(token, userId, expiresAt);
  }
  async deleteResetTokens(userId: number): Promise<void> {
    await this.store.db.prepare('DELETE FROM reset_tokens WHERE userId=?').run(userId);
  }
  async consumeResetTokens(userId: number): Promise<void> {
    await this.store.db.prepare('UPDATE reset_tokens SET used=1 WHERE userId=?').run(userId);
  }
  async expireCredentials(): Promise<void> {
    await this.store.db.prepare('DELETE FROM sessions WHERE lastSeen<?').run(Date.now() - 30 * 60000);
    await this.store.db.prepare('DELETE FROM reset_tokens WHERE expiresAt<?').run(Date.now() - 86400000);
  }
  async compactAfterPrivacy(): Promise<void> {
    if (this.store.dialect === 'sqlite') await this.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  }
}
