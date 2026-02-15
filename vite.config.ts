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
          try {
            if (req.url?.startsWith('/api/auth/signup')) {
              if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }

              await ensureIndexes();
              const { email, password } = await readJsonBody(req);
              const normalizedEmail = String(email || '').trim().toLowerCase();
              const rawPassword = String(password || '');

              if (!normalizedEmail || !rawPassword || rawPassword.length < 8) {
                sendJson(res, 400, { error: 'Email and password (min 8 chars) are required' });
                return;
              }

              const client = await getMongoClient();
              const db = client.db('financial-time-machine');
              const users = db.collection('users');
              const existing = await users.findOne({ email: normalizedEmail }, { projection: { _id: 1 } });
              if (existing) {
                sendJson(res, 409, { error: 'Email already in use' });
                return;
              }

              const bcryptModule = await import('bcryptjs');
              const bcrypt: any = (bcryptModule as any).default ?? bcryptModule;
              const passwordHash = await bcrypt.hash(rawPassword, 10);
              const now = new Date().toISOString();
              const insert = await users.insertOne({
                email: normalizedEmail,
                passwordHash,
                createdAt: now,
                updatedAt: now
              });

              const jwtModule = await import('jsonwebtoken');
              const jwt: any = (jwtModule as any).default ?? jwtModule;
              const token = jwt.sign(
                { email: normalizedEmail },
                getJwtSecret(),
                { subject: insert.insertedId.toString(), expiresIn: `${JWT_TTL_SECONDS}s` }
              );
              setAuthCookie(res, token);
              sendJson(res, 201, { user: { id: insert.insertedId.toString(), email: normalizedEmail } });
              return;
            }

            if (req.url?.startsWith('/api/auth/login')) {
              if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }

              const { email, password } = await readJsonBody(req);
              const normalizedEmail = String(email || '').trim().toLowerCase();
              const rawPassword = String(password || '');

              if (!normalizedEmail || !rawPassword) {
                sendJson(res, 400, { error: 'Email and password are required' });
                return;
              }

              const client = await getMongoClient();
              const db = client.db('financial-time-machine');
              const user = await db.collection('users').findOne(
                { email: normalizedEmail },
                { projection: { _id: 1, email: 1, passwordHash: 1 } }
              );

              if (!user?.passwordHash) {
                sendJson(res, 401, { error: 'Invalid credentials' });
                return;
              }

              const bcryptModule = await import('bcryptjs');
              const bcrypt: any = (bcryptModule as any).default ?? bcryptModule;
              const isValid = await bcrypt.compare(rawPassword, user.passwordHash);
              if (!isValid) {
                sendJson(res, 401, { error: 'Invalid credentials' });
                return;
              }

              const jwtModule = await import('jsonwebtoken');
              const jwt: any = (jwtModule as any).default ?? jwtModule;
              const token = jwt.sign(
                { email: user.email },
                getJwtSecret(),
                { subject: user._id.toString(), expiresIn: `${JWT_TTL_SECONDS}s` }
              );
              setAuthCookie(res, token);
              sendJson(res, 200, { user: { id: user._id.toString(), email: user.email } });
              return;
            }

            if (req.url?.startsWith('/api/auth/logout')) {
              if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }
              clearAuthCookie(res);
              sendJson(res, 200, { ok: true });
              return;
            }

            if (req.url?.startsWith('/api/auth/me')) {
              if (req.method !== 'GET') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }

              const session = await authenticateRequest(req);
              if (!session) {
                sendJson(res, 401, { user: null });
                return;
              }
              sendJson(res, 200, { user: { id: session.userId, email: session.email } });
              return;
            }

            if (req.url?.startsWith('/api/plaid/status')) {
              if (req.method !== 'GET') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }

              const session = await authenticateRequest(req);
              if (!session) {
                sendJson(res, 401, { error: 'Unauthorized' });
                return;
              }

              const client = await getMongoClient();
              const db = client.db('financial-time-machine');
              const { ObjectId } = await import('mongodb');
              const user = await db.collection('users').findOne(
                { _id: new ObjectId(session.userId) },
                { projection: { plaidAccessToken: 1, plaidItemId: 1 } }
              );

              sendJson(res, 200, {
                connected: Boolean(user?.plaidAccessToken && user?.plaidItemId)
              });
              return;
            }

            if (req.url?.startsWith('/api/plaid/create_link_token')) {
              if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }

              const session = await authenticateRequest(req);
              if (!session) {
                sendJson(res, 401, { error: 'Unauthorized' });
                return;
              }

              const plaidClient = await getPlaidClient();
              const response = await plaidClient.linkTokenCreate({
                user: { client_user_id: session.userId },
                client_name: 'Financial Time Machine',
                language: 'en',
                country_codes: ['US'],
                products: ['transactions']
              });

              sendJson(res, 200, { link_token: response.data.link_token });
              return;
            }

            if (req.url?.startsWith('/api/plaid/exchange_public_token')) {
              if (req.method !== 'POST') {
                sendJson(res, 405, { error: 'Method not allowed' });
                return;
              }

              const session = await authenticateRequest(req);
              if (!session) {
                sendJson(res, 401, { error: 'Unauthorized' });
                return;
              }

              const { public_token } = await readJsonBody(req);
              if (!public_token) {
                sendJson(res, 400, { error: 'public_token is required' });
                return;
              }

              const plaidClient = await getPlaidClient();
              const exchange = await plaidClient.itemPublicTokenExchange({ public_token });

              const client = await getMongoClient();
              const db = client.db('financial-time-machine');
              const { ObjectId } = await import('mongodb');
              await db.collection('users').updateOne(
                { _id: new ObjectId(session.userId) },
                {
                  $set: {
                    plaidAccessToken: exchange.data.access_token,
                    plaidItemId: exchange.data.item_id,
                    plaidUpdatedAt: new Date().toISOString()
                  }
                }
              );

              sendJson(res, 200, { connected: true });
              return;
            }

            if (!req.url?.startsWith('/api/transactions')) return next();
            if (req.method !== 'GET') {
              sendJson(res, 405, { error: 'Method not allowed' });
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
