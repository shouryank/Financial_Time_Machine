import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    let mongoClientPromise: Promise<any> | null = null;

    const getMongoClient = async () => {
      if (!env.MONGO_URI) {
        throw new Error('MONGO_URI is missing from environment variables');
      }

      if (!mongoClientPromise) {
        mongoClientPromise = (async () => {
          const { MongoClient } = await import('mongodb');
          const client = new MongoClient(env.MONGO_URI);
          await client.connect();
          return client;
        })();
      }

      return mongoClientPromise;
    };

    const transactionsApiPlugin = {
      name: 'atlas-transactions-api',
      configureServer(server: any) {
        server.middlewares.use(async (req: any, res: any, next: any) => {
          if (!req.url?.startsWith('/api/transactions')) return next();
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          try {
            const client = await getMongoClient();
            const db = client.db('financial-time-machine');
            const docs = await db
              .collection('transactions')
              .find(
                {},
                {
                  projection: {
                    _id: 0,
                    id: 1,
                    date: 1,
                    amount: 1,
                    merchant: 1,
                    category: 1,
                    accountId: 1,
                    type: 1,
                    intent: 1
                  }
                }
              )
              .sort({ date: 1 })
              .limit(500)
              .toArray();

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ transactions: docs }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Failed to load transactions from Atlas' }));
          }
        });
      }
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), transactionsApiPlugin],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
