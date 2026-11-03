import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createStore } from '../server/store.mjs';
import { anonymizeClient, purgeClientBackups } from '../server/privacy.mjs';
import { enqueue } from '../server/common.mjs';
import { startEmailWorker } from '../server/email-worker.mjs';
function folder(t) { const root = mkdtempSync(join(tmpdir(), 'oscar-api-test-')); t.after(() => { const safe = resolve(root); assert.ok(safe.startsWith(resolve(tmpdir()) + sep + 'oscar-api-test-')); rmSync(safe, { recursive: true, force: true }); }); return root; }
test('SQLite persiste entre reinícios e cópia diária pode ser restaurada sem duplicar seed', async (t) => { const dir = folder(t), filename = join(dir, 'oscar.sqlite'); let s = createStore({ filename }); const original = await s.get('parts', 1); await s.transaction(async () => await s.save('parts', { ...original, stock: original.stock + 5 })); const first = await s.backup(), second = await s.backup(); assert.equal(first.filename, second.filename); assert.equal(readdirSync(join(dir, 'backups')).filter(f => f.endsWith('.sqlite')).length, 1); await s.close(); s = createStore({ filename }); assert.equal((await s.get('parts', 1)).stock, original.stock + 5); assert.equal((await s.list('users')).length, 6); const restored = createStore({ filename: join(dir, 'backups', first.filename), seed: false }); assert.equal((await restored.get('parts', 1)).stock, original.stock + 5); assert.equal((await restored.list('orders')).length, 6); await restored.close(); await s.close(); });
test('RNF14 expurga o titular em base ativa e snapshots diários preservando outros clientes', async (t) => {
    const dir = folder(t), filename = join(dir, 'oscar.sqlite'), s = createStore({ filename });
    const old = await s.get('clients', 1), other = await s.get('clients', 2);
    const backup = await s.backup(), backupFile = join(dir, 'backups', backup.filename);
    await s.transaction(async () => await anonymizeClient(s, 1, { id: 1, name: 'Gerente' }));
    const result = await purgeClientBackups(s, 1, { id: 1, name: 'Gerente' });
    assert.equal(result.processed, 1);
    await s.db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
    assert.equal((await s.get('clients', 1)).active, false);
    assert.equal((await s.get('clients', 2)).name, other.name);
    assert.equal((await s.get('users', 5)).active, false);
    const restored = createStore({ filename: backupFile, seed: false });
    assert.equal((await restored.get('clients', 1)).cpf, '');
    assert.equal((await restored.get('clients', 1)).email, 'anonimizado-1@oscar.invalid');
    assert.equal((await restored.get('clients', 2)).name, other.name);
    assert.equal((await restored.get('vehicles', 1)).chassis, '');
    assert.equal((await restored.list('orders')).length, 6);
    await restored.close();
    await s.close();
    for (const file of [filename, backupFile]) {
        const binary = readFileSync(file);
        for (const secret of [old.name, old.email, old.cpf, old.phone, '9BWZZZ377VT004251'])
            assert.ok(!binary.includes(Buffer.from(secret)), `${secret} ainda presente fisicamente em ${file}`);
    }
});
test('RNF17 falha de SMTP é isolada e mensagens permanecem na fila para nova tentativa', async (t) => {
    const previous = process.env.SMTP_HOST;
    process.env.SMTP_HOST = 'smtp.test.invalid';
    t.after(() => {
        if (previous === undefined)
            delete process.env.SMTP_HOST;
        else
            process.env.SMTP_HOST = previous;
    });
    const s = createStore({ filename: ':memory:' });
    t.after(async () => await s.close());
    const message = await enqueue(s, 'cliente@oscar.local', 'Confirmação', 'Teste fictício');
    let release;
    const delivered = new Promise(resolve => release = resolve);
    const worker = await startEmailWorker(s, { transport: async () => { release(); throw new Error('SMTP indisponível'); }, intervalMs: 60000 });
    t.after(() => worker.stop());
    await delivered;
    await new Promise(resolve => setImmediate(resolve));
    const saved = await s.get('emails', message.id);
    assert.equal(saved.status, 'erro');
    assert.equal(saved.attempts, 1);
    assert.ok(Date.parse(saved.nextAttemptAt) > Date.now());
    assert.ok((await s.list('orders')).length > 0);
    const before = await s.settings();
    await s.saveSettings({ ...before, workshopName: 'Operação independente do SMTP' });
    assert.equal((await s.settings()).workshopName, 'Operação independente do SMTP');
});
