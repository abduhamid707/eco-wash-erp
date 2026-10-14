import Fastify from 'fastify';
import cors from '@fastify/cors';
import { z } from 'zod';

const app = Fastify({ logger: true });
const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT ?? 4000);
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
await app.register(cors, { origin });
app.get('/health', async () => ({ status: 'ok', service: 'eco-wash-api' }));
// Business endpoints require auth, idempotency, transaction posting, and audit before enablement.
app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.status(error.statusCode ?? 500).send({ error: 'REQUEST_FAILED' });
});
await app.listen({ port, host: '0.0.0.0' });
