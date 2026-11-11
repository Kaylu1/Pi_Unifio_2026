// Consultas do relatório operacional. Os filtros são parâmetros, nunca trechos de SQL do navegador.
const sqliteOrders = `
  SELECT o.data AS "orderData", c.data ->> '$.name' AS "clientName",
         v.data ->> '$.plate' AS "vehiclePlate"
  FROM orders o
  JOIN clients c ON c.id = o.clientId
  JOIN vehicles v ON v.id = o.vehicleId
  WHERE (? = 0 OR o.mechanicId = ?)
  ORDER BY o.id DESC`;
const postgresOrders = `
  SELECT o.data AS "orderData", c.data ->> 'name' AS "clientName",
         v.data ->> 'plate' AS "vehiclePlate"
  FROM orders o
  JOIN clients c ON c.id = o.clientId
  JOIN vehicles v ON v.id = o.vehicleId
  WHERE (? = 0 OR o.mechanicId = ?)
  ORDER BY o.id DESC`;
const sqliteParts = `
  SELECT p.id AS "partId", p.data AS "partData",
         ROUND(SUM(CASE WHEN m.data ->> '$.type' = 'saida'
           THEN CAST(m.data ->> '$.quantity' AS REAL)
           ELSE -CAST(m.data ->> '$.quantity' AS REAL) END), 3) AS quantity
  FROM movements m
  JOIN parts p ON p.id = m.partId
  LEFT JOIN orders o ON o.id = m.orderId
  WHERE m.data ->> '$.type' IN ('saida', 'estorno')
    AND SUBSTR(m.data ->> '$.date', 1, 10) BETWEEN ? AND ?
    AND (? = 0 OR o.mechanicId = ?)
  GROUP BY p.id, p.data
  HAVING ROUND(SUM(CASE WHEN m.data ->> '$.type' = 'saida'
    THEN CAST(m.data ->> '$.quantity' AS REAL)
    ELSE -CAST(m.data ->> '$.quantity' AS REAL) END), 3) <> 0
  ORDER BY p.id`;
const postgresParts = `
  SELECT p.id AS "partId", p.data AS "partData",
         ROUND(SUM(CASE WHEN m.data ->> 'type' = 'saida'
           THEN (m.data ->> 'quantity')::numeric
           ELSE -(m.data ->> 'quantity')::numeric END), 3) AS quantity
  FROM movements m
  JOIN parts p ON p.id = m.partId
  LEFT JOIN orders o ON o.id = m.orderId
  WHERE m.data ->> 'type' IN ('saida', 'estorno')
    AND LEFT(m.data ->> 'date', 10) BETWEEN ? AND ?
    AND (? = 0 OR o.mechanicId = ?)
  GROUP BY p.id, p.data
  HAVING ROUND(SUM(CASE WHEN m.data ->> 'type' = 'saida'
    THEN (m.data ->> 'quantity')::numeric
    ELSE -(m.data ->> 'quantity')::numeric END), 3) <> 0
  ORDER BY p.id`;
function record(value: any) {
    return typeof value === 'string' ? JSON.parse(value) : value;
}
export async function reportOrders(store: any, mechanicId: any = null) {
    if (store.reportOrders) return await store.reportOrders(mechanicId);
    const rows = await store.db.prepare(store.dialect === 'postgres' ? postgresOrders : sqliteOrders)
        .all(mechanicId ?? 0, mechanicId ?? 0);
    return rows.map((row: any) => ({ order: record(row.orderData), clientName: row.clientName,
        vehiclePlate: row.vehiclePlate }));
}
export async function reportPartConsumption(store: any, from: any, to: any, mechanicId: any = null) {
    if (store.reportPartConsumption) return await store.reportPartConsumption(from, to, mechanicId);
    const rows = await store.db.prepare(store.dialect === 'postgres' ? postgresParts : sqliteParts)
        .all(from, to, mechanicId ?? 0, mechanicId ?? 0);
    return rows.map((row: any) => ({ partId: Number(row.partId), part: record(row.partData),
        quantity: Number(row.quantity) }));
}
