/** Cache restrito a uma requisição; toda gravação invalida as leituras da tabela. Nunca cruza usuários. */
export function requestStore(store: any) {
    const lists = new Map(), records = new Map();
    let settings;
    const view = Object.create(store), copy = (value: any) => value === undefined ? undefined : structuredClone(value);
    const invalidate = (table: any) => { lists.delete(table); for (const key of records.keys())
        if (key.startsWith(table + ':'))
            records.delete(key); };
    view.list = async (table: any) => { if (!lists.has(table))
        lists.set(table, Promise.resolve(store.list(table))); return copy(await lists.get(table)); };
    view.get = async (table: any, id: any) => { if (lists.has(table)) {
        const rows = await lists.get(table);
        return copy(rows.find((row: any) => row.id === Number(id)) ?? null);
    } const key = table + ':' + id; if (!records.has(key))
        records.set(key, Promise.resolve(store.get(table, id))); return copy(await records.get(key)); };
    view.settings = async () => { settings ??= Promise.resolve(store.settings()); return copy(await settings); };
    view.save = async (table: any, record: any) => { try {
        return await store.save(table, record);
    }
    finally {
        invalidate(table);
    } };
    view.saveSettings = async (data: any) => { try {
        return await store.saveSettings(data);
    }
    finally {
        settings = undefined;
    } };
    view.audit = async (...args: any[]) => { try {
        return await store.audit(...args);
    }
    finally {
        invalidate('audit');
    } };
    if (store.remove) view.remove = async (table: string, id: number) => {
        try { return await store.remove(table, id); } finally { invalidate(table); }
    };
    return view;
}
