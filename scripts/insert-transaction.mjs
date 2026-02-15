import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';

const DB_NAME = 'financial-time-machine';
const COLLECTION_NAME = 'transactions';

const TRANSACTION = {
  id: 'tx_001',
  date: '2025-01-05',
  amount: -3200,
  merchant: 'Employer Payroll',
  category: 'Income',
  accountId: 'acc_checking',
  type: 'credit',
  intent: 'neutral'
};

async function getMongoUriFromEnvLocal(path = '.env.local') {
  const content = await readFile(path, 'utf8');
  const match = content.match(/^MONGO_URI\s*=\s*["']?(.+?)["']?\s*$/m);
  if (!match || !match[1]) {
    throw new Error('MONGO_URI is missing in .env.local');
  }
  return match[1].trim();
}

function redactMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.username || parsed.password) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '[invalid-uri]';
  }
}

async function run() {
  const uri = await getMongoUriFromEnvLocal();
  const client = new MongoClient(uri);

  try {
    console.log('Connecting to Atlas:', redactMongoUri(uri));
    await client.connect();

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const insertPayload = {
      ...TRANSACTION,
      insertedAt: new Date().toISOString()
    };

    const insertResult = await collection.insertOne(insertPayload);
    console.log('Insert successful. insertedId:', insertResult.insertedId);

    const found = await collection.findOne(
      { _id: insertResult.insertedId },
      { projection: { _id: 1, id: 1, merchant: 1, amount: 1, category: 1, accountId: 1, type: 1, intent: 1, date: 1, insertedAt: 1 } }
    );

    console.log('Inserted record verification:', found);

    const totalCount = await collection.countDocuments();
    console.log(`Collection count for ${DB_NAME}.${COLLECTION_NAME}:`, totalCount);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Insert failed:', error.message);
  process.exitCode = 1;
});

