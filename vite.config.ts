import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    let mongoClientPromise: Promise<any> | null = null;

    const AUTH_COOKIE_NAME = 'ftm_auth';
    const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;

    let plaidClientPromise: Promise<any> | null = null;

    const getPlaidClient = async () => {
      if (!env.PLAID_CLIENT_ID || !env.PLAID_SECRET) {
        throw new Error('PLAID_CLIENT_ID and PLAID_SECRET are required');
      }

      if (!plaidClientPromise) {
        plaidClientPromise = (async () => {
          const plaidModule: any = await import('plaid');
          const plaid = plaidModule.default ?? plaidModule;
          const configuration = new plaid.Configuration({
            basePath: plaid.PlaidEnvironments.sandbox,
            baseOptions: {
              headers: {
                'PLAID-CLIENT-ID': env.PLAID_CLIENT_ID,
                'PLAID-SECRET': env.PLAID_SECRET
              }
            }
          });
          return new plaid.PlaidApi(configuration);
        })();
      }

      return plaidClientPromise;
    };

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

    const getJwtSecret = () => {
      if (!env.JWT_SECRET) {
        throw new Error('JWT_SECRET is missing from environment variables');
      }
      return env.JWT_SECRET;
    };

    const parseCookies = (cookieHeader: string | undefined): Record<string, string> => {
      if (!cookieHeader) return {};
      return cookieHeader
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((acc: Record<string, string>, part) => {
          const idx = part.indexOf('=');
          if (idx === -1) return acc;
          const key = decodeURIComponent(part.slice(0, idx).trim());
          const value = decodeURIComponent(part.slice(idx + 1).trim());
          acc[key] = value;
          return acc;
        }, {});
    };

    const readJsonBody = async (req: any) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (chunks.length === 0) return {};
      const text = Buffer.concat(chunks).toString('utf8');
      return JSON.parse(text || '{}');
    };

    const sendJson = (res: any, statusCode: number, payload: unknown) => {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    };

    const setAuthCookie = (res: any, token: string) => {
      const parts = [
        `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        `Max-Age=${JWT_TTL_SECONDS}`
      ];
      if (mode !== 'development') {
        parts.push('Secure');
      }
      res.setHeader('Set-Cookie', parts.join('; '));
    };

    const clearAuthCookie = (res: any) => {
      const parts = [
        `${AUTH_COOKIE_NAME}=`,
        'HttpOnly',
        'Path=/',
        'SameSite=Lax',
        'Max-Age=0'
      ];
      if (mode !== 'development') {
        parts.push('Secure');
      }
      res.setHeader('Set-Cookie', parts.join('; '));
    };

    const authenticateRequest = async (req: any) => {
      const cookies = parseCookies(req.headers.cookie);
      const token = cookies[AUTH_COOKIE_NAME];
      if (!token) return null;

      const jwtModule = await import('jsonwebtoken');
      const jwt: any = (jwtModule as any).default ?? jwtModule;
      const payload = jwt.verify(token, getJwtSecret()) as { sub?: string; email?: string };
      if (!payload?.sub || !payload?.email) return null;
      return { userId: payload.sub, email: payload.email };
    };

    const ensureIndexes = async () => {
      const client = await getMongoClient();
      const db = client.db('financial-time-machine');
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
      await db.collection('transactions').createIndex({ userId: 1, date: 1 });
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

            if (req.url?.startsWith('/api/plaid/disconnect')) {
              if (req.method !== 'POST') {
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
                { projection: { plaidAccessToken: 1 } }
              );

              if (user?.plaidAccessToken) {
                try {
                  const plaidClient = await getPlaidClient();
                  await plaidClient.itemRemove({ access_token: user.plaidAccessToken });
                } catch {
                  // Continue cleanup even if Plaid item is already invalid/missing.
                }
              }

              await db.collection('users').updateOne(
                { _id: new ObjectId(session.userId) },
                {
                  $unset: {
                    plaidAccessToken: '',
                    plaidItemId: '',
                    plaidUpdatedAt: ''
                  }
                }
              );

              sendJson(res, 200, { connected: false });
              return;
            }

            if (!req.url?.startsWith('/api/transactions')) return next();
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
            const docs = await db
              .collection('transactions')
              .find(
                { userId: new ObjectId(session.userId) },
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
                    intent: 1,
                    userId: 1
                  }
                }
              )
              .sort({ date: 1 })
              .limit(500)
              .toArray();

            sendJson(res, 200, { transactions: docs });
          } catch (error: any) {
            console.error('Auth/API middleware error:', error);
            sendJson(
              res,
              500,
              { error: mode === 'development' ? (error?.message || 'Server error') : 'Server error' }
            );
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
