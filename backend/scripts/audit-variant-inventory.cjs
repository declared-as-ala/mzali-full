/* Read-only migration preflight. Native collections only: no models, index
 * creation, migrations, updates, exports of customers, or allocation guesses. */
const { MongoClient } = require('mongodb');
async function main() {
  const uri = process.env.INVENTORY_AUDIT_URI;
  if (!uri) throw new Error('Set INVENTORY_AUDIT_URI to the explicitly selected database.');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    const counts = {};
    for (const name of ['products', 'variants', 'stock_items', 'stock_movements', 'orders', 'pos_sales', 'stock_transfers', 'stocktakes']) counts[name] = await db.collection(name).countDocuments({});
    const duplicates = await db.collection('stock_items').aggregate([{ $group: { _id: { variantId: '$variantId', locationId: '$locationId' }, count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: 'count' }]).toArray();
    const negative = await db.collection('stock_items').countDocuments({ $or: [{ quantityOnHand: { $lt: 0 } }, { quantityReserved: { $lt: 0 } }] });
    const totals = await db.collection('stock_items').aggregate([{ $group: { _id: '$locationId', onHand: { $sum: '$quantityOnHand' }, reserved: { $sum: '$quantityReserved' }, rows: { $sum: 1 } } }]).toArray();
    const legacyProducts = await db.collection('products').countDocuments({ inventoryModel: { $ne: 'MATRIX' } });
    const unresolvedOrderLines = await db.collection('orders').aggregate([{ $unwind: '$items' }, { $match: { 'items.variantId': null } }, { $count: 'count' }]).toArray();
    const duplicateSkus = await db.collection('variants').aggregate([{ $group: { _id: '$sku', count: { $sum: 1 } } }, { $match: { count: { $gt: 1 } } }, { $count: 'count' }]).toArray();
    const variants = await db.collection('variants').find({}, { projection: { _id: 1, productId: 1 } }).toArray();
    const products = await db.collection('products').find({}, { projection: { _id: 1 } }).toArray();
    const productIds = new Set(products.map(p => String(p._id)));
    const variantIds = new Set(variants.map(v => String(v._id)));
    const orphanVariants = variants.filter(v => !productIds.has(String(v.productId))).length;
    const stocks = await db.collection('stock_items').find({}).toArray();
    const orphanStocks = stocks.filter(s => !variantIds.has(String(s.variantId))).length;
    const latest = await db.collection('stock_movements').aggregate([
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: { variantId: '$variantId', locationId: '$locationId' }, onHand: { $first: '$onHandAfter' }, reserved: { $first: '$reservedAfter' } } },
    ], { allowDiskUse: true }).toArray();
    const key = (v, l) => JSON.stringify([String(v), l]);
    const byKey = new Map(latest.map(m => [key(m._id.variantId, m._id.locationId), m]));
    let missingLedger = 0, ledgerMismatches = 0;
    for (const stock of stocks) {
      const movement = byKey.get(key(stock.variantId, stock.locationId));
      if (!movement) missingLedger++;
      else if (stock.quantityOnHand !== movement.onHand || stock.quantityReserved !== movement.reserved) ledgerMismatches++;
    }
    console.log(JSON.stringify({ mode: 'READ_ONLY_DRY_RUN', at: new Date().toISOString(), counts, legacyProducts, duplicates, duplicateSkus, negative, orphanVariants, orphanStocks, missingLedger, ledgerMismatches, totals, unresolvedOrderLines, nextStep: 'Review and manually allocate each product. This script never creates variants or distributes quantities.' }, null, 2));
    if (duplicates.length || duplicateSkus.length || negative || orphanVariants || orphanStocks || missingLedger || ledgerMismatches) process.exitCode = 2;
  } finally { await client.close(); }
}
main().catch(e => { console.error(e.name === 'MongoServerError' ? 'Database audit failed; inspect access and database configuration.' : e.message?.includes('INVENTORY_AUDIT_URI') ? e.message : 'Read-only audit failed.'); process.exitCode = 1; });
