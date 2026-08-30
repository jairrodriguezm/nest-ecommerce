import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a fresh NestJS application with the same global pipes as main.ts */
async function createApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

// ─── Root ─────────────────────────────────────────────────────────────────────

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('GET / → 200 Hello World!', () =>
    request(app.getHttpServer()).get('/').expect(200).expect('Hello World!'),
  );
});

// ─── Users ────────────────────────────────────────────────────────────────────

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let createdUserId: number;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('POST /users → 201 creates a user', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .send({ email: `e2e-${Date.now()}@test.com`, name: 'E2E User' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.email).toContain('@test.com');
    createdUserId = res.body.id;
  });

  it('GET /users → 200 returns array containing the created user', async () => {
    const res = await request(app.getHttpServer()).get('/users').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((u: any) => u.id === createdUserId);
    expect(found).toBeDefined();
  });

  it('GET /users/:id → 200 returns the created user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/users/${createdUserId}`)
      .expect(200);
    expect(res.body.id).toBe(createdUserId);
  });

  it('GET /users/:id → 404 for non-existent user', () =>
    request(app.getHttpServer()).get('/users/999999').expect(404),
  );

  it('POST /users → 409 on duplicate email', async () => {
    const email = `dup-${Date.now()}@test.com`;
    await request(app.getHttpServer()).post('/users').send({ email, name: 'User A' }).expect(201);
    await request(app.getHttpServer()).post('/users').send({ email, name: 'User B' }).expect(409);
  });

  it('POST /users → 400 on invalid payload (missing name)', () =>
    request(app.getHttpServer())
      .post('/users')
      .send({ email: 'no-name@test.com' })
      .expect(400),
  );

  it('DELETE /users/:id → 200 deletes the user', () =>
    request(app.getHttpServer()).delete(`/users/${createdUserId}`).expect(200),
  );

  it('GET /users/:id → 404 after deletion', () =>
    request(app.getHttpServer()).get(`/users/${createdUserId}`).expect(404),
  );
});

// ─── Categories ───────────────────────────────────────────────────────────────

describe('Categories (e2e)', () => {
  let app: INestApplication<App>;
  let rootCategoryId: number;
  let childCategoryId: number;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('POST /categories → 201 creates a root category', async () => {
    const res = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'E2E Root Category', description: 'Root' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    rootCategoryId = res.body.id;
  });

  it('POST /categories → 201 creates a child category', async () => {
    const res = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'E2E Child Category', parentId: rootCategoryId })
      .expect(201);

    expect(res.body.id).toBeDefined();
    childCategoryId = res.body.id;
  });

  it('GET /categories → 200 returns array with categories', async () => {
    const res = await request(app.getHttpServer()).get('/categories').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('GET /categories/:id → 200 returns the category', async () => {
    const res = await request(app.getHttpServer())
      .get(`/categories/${rootCategoryId}`)
      .expect(200);
    expect(res.body.id).toBe(rootCategoryId);
  });

  it('GET /categories/:id/tree → 200 returns nested tree with child', async () => {
    const res = await request(app.getHttpServer())
      .get(`/categories/${rootCategoryId}/tree`)
      .expect(200);

    expect(res.body.id).toBe(rootCategoryId);
    expect(Array.isArray(res.body.children)).toBe(true);
    const child = res.body.children.find((c: any) => c.id === childCategoryId);
    expect(child).toBeDefined();
  });

  it('GET /categories/:id → 404 for non-existent category', () =>
    request(app.getHttpServer()).get('/categories/999999').expect(404),
  );
});

// ─── Products ─────────────────────────────────────────────────────────────────

describe('Products (e2e)', () => {
  let app: INestApplication<App>;
  let createdProductId: number;

  beforeAll(async () => { app = await createApp(); });
  afterAll(async () => { await app.close(); });

  it('POST /products → 201 creates a product', async () => {
    const res = await request(app.getHttpServer())
      .post('/products')
      .send({ name: 'E2E Product', price: 49.99, stock: 100 })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('E2E Product');
    createdProductId = res.body.id;
  });

  it('GET /products → 200 returns array containing the created product', async () => {
    const res = await request(app.getHttpServer()).get('/products').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: any) => p.id === createdProductId);
    expect(found).toBeDefined();
  });

  it('GET /products/:id → 200 returns the product by ID', async () => {
    const res = await request(app.getHttpServer())
      .get(`/products/${createdProductId}`)
      .expect(200);
    expect(res.body.id).toBe(createdProductId);
  });

  it('GET /products/search?q=E2E → 200 returns matching products', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/search?q=E2E')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: any) => p.id === createdProductId);
    expect(found).toBeDefined();
  });

  it('GET /products/search?q=xyznotfound → 200 returns empty array', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/search?q=xyznotfound_e2e_unique')
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('GET /products/:id → 404 for non-existent product', () =>
    request(app.getHttpServer()).get('/products/999999').expect(404),
  );

  it('POST /products → 400 on invalid payload (missing price)', () =>
    request(app.getHttpServer())
      .post('/products')
      .send({ name: 'No Price Product' })
      .expect(400),
  );

  it('DELETE /products/:id → 200 deletes the product', () =>
    request(app.getHttpServer()).delete(`/products/${createdProductId}`).expect(200),
  );
});

// ─── Orders — Full Flow ───────────────────────────────────────────────────────

describe('Orders (e2e) — full happy-path flow', () => {
  let app: INestApplication<App>;
  let userId: number;
  let productId: number;
  let orderId: number;

  beforeAll(async () => {
    app = await createApp();

    // Create a user
    const userRes = await request(app.getHttpServer())
      .post('/users')
      .send({ email: `orders-e2e-${Date.now()}@test.com`, name: 'Order User' });
    userId = userRes.body.id;

    // Create a product with stock
    const productRes = await request(app.getHttpServer())
      .post('/products')
      .send({ name: 'Order Test Product', price: 25.0, stock: 50 });
    productId = productRes.body.id;
  });

  afterAll(async () => { await app.close(); });

  it('POST /orders → 201 creates an order', async () => {
    const res = await request(app.getHttpServer())
      .post('/orders')
      .send({ userId, items: [{ productId, quantity: 3 }] })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('pending');
    expect(Number(res.body.total)).toBe(75);
    orderId = res.body.id;
  });

  it('GET /orders → 200 returns list containing the new order', async () => {
    const res = await request(app.getHttpServer()).get('/orders').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((o: any) => o.id === orderId);
    expect(found).toBeDefined();
  });

  it('GET /orders?userId=:id → 200 returns orders filtered by user', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders?userId=${userId}`)
      .expect(200);
    expect(res.body.every((o: any) => o.userId === userId)).toBe(true);
  });

  it('GET /orders/:id → 200 returns the order by ID', async () => {
    const res = await request(app.getHttpServer()).get(`/orders/${orderId}`).expect(200);
    expect(res.body.id).toBe(orderId);
  });

  it('GET /orders/:id/full → 200 returns enriched order with limited user fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/orders/${orderId}/full`)
      .expect(200);

    expect(res.body.id).toBe(orderId);
    expect(res.body.user.id).toBeDefined();
    expect(res.body.user.name).toBeDefined();
    expect(res.body.user.email).toBeDefined();
    // Sensitive fields should NOT be exposed
    expect(res.body.user.isActive).toBeUndefined();
    expect(res.body.user.createdAt).toBeUndefined();
  });

  it('POST /orders → 400 when stock is insufficient', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({ userId, items: [{ productId, quantity: 99999 }] })
      .expect(400),
  );

  it('POST /orders/:id/pay → 200 processes payment and sets status to confirmed', async () => {
    // May need retries if Math.random hits the 10% failure rate; re-try up to 5 times
    let res: request.Response;
    for (let i = 0; i < 5; i++) {
      // Create a fresh order to pay each time (in case the previous attempt partially failed)
      if (i > 0) {
        const fresh = await request(app.getHttpServer())
          .post('/orders')
          .send({ userId, items: [{ productId, quantity: 1 }] });
        orderId = fresh.body.id;
      }
      res = await request(app.getHttpServer()).post(`/orders/${orderId}/pay`);
      if (res.status === 200) break;
    }
    expect(res!.status).toBe(200);
    expect(res!.body.success).toBe(true);
    expect(res!.body.transactionId).toMatch(/^TXN-/);
  });

  it('POST /orders/:id/pay → 400 when order is already CONFIRMED', () =>
    request(app.getHttpServer()).post(`/orders/${orderId}/pay`).expect(400),
  );

  it('POST /orders (new) then POST /orders/:id/cancel → 200', async () => {
    const orderRes = await request(app.getHttpServer())
      .post('/orders')
      .send({ userId, items: [{ productId, quantity: 1 }] })
      .expect(201);
    const newOrderId = orderRes.body.id;

    const cancelRes = await request(app.getHttpServer())
      .post(`/orders/${newOrderId}/cancel`)
      .expect(200);

    expect(cancelRes.body.status).toBe('cancelled');
  });

  it('GET /orders/:id → 404 for non-existent order', () =>
    request(app.getHttpServer()).get('/orders/999999').expect(404),
  );

  it('POST /orders → 400 on invalid payload (missing userId)', () =>
    request(app.getHttpServer())
      .post('/orders')
      .send({ items: [{ productId, quantity: 1 }] })
      .expect(400),
  );
});

