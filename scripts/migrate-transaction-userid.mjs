import { readFile } from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';

const DB_NAME = 'financial-time-machine';
const USERS_COLLECTION = 'users';
const TRANSACTIONS_COLLECTION = 'transactions';

async function getMongoUriFromEnvLocal(path = '.env.local') {
  const content = await readFile(path, 'utf8');
  const match = content.match(/^MONGO_URI\s*=\s*["']?(.+?)["']?\s*$/m);
  if (!match || !match[1]) {
    throw new Error('MONGO_URI is missing in .env.local');
  }
  return match[1].trim();
}

async function run() {
  const emailArg = process.argv.find(arg => arg.startsWith('--email='));
  const email = emailArg?.split('=')[1]?.trim().toLowerCase();

  if (!email) {
    throw new Error('Missing required argument: --email=user@example.com');
  }

  const uri = await getMongoUriFromEnvLocal();
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const users = db.collection(USERS_COLLECTION);
    const transactions = db.collection(TRANSACTIONS_COLLECTION);

    const user = await users.findOne({ email }, { projection: { _id: 1, email: 1 } });
    if (!user?._id) {
      throw new Error(`User not found for email: ${email}`);
    }

    const userId = new ObjectId(user._id);
    const result = await transactions.updateMany(
      {
        $or: [
          { userId: { $exists: false } },
          { userId: null }
        ]
      },
      {
        $set: { userId }
      }
    );

    console.log(`Migration complete for ${email}`);
    console.log('Matched:', result.matchedCount);
    console.log('Modified:', result.modifiedCount);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
});

