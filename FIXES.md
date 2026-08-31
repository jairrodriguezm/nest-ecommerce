# Bug Fixes

Detailed solutions for every bug listed in **[BUGS.md](./BUGS.md)**.

Each entry contains the file to edit, a *before* snippet showing the broken code, and an *after* snippet showing the correct code.

---

## 🔴 Critical

### Bug #1 — Infinite recursion in `buildCategoryTree`

**File:** `src/products/products.service.ts`

**Problem:** The recursive helper called itself on both `category.children` *and* `category.parent`, following the bidirectional TypeORM relation graph in a cycle until the call stack was exhausted.

```typescript
// ❌ Before — traverses parent reference, creating an infinite loop
private buildCategoryTree(category: Category): any {
  return {
    id: category.id,
    name: category.name,
    parent: category.parent
      ? this.buildCategoryTree(category.parent) // ← cycles back up the tree
      : null,
    children: category.children.map(child =>
      this.buildCategoryTree(child),
    ),
  };
}
```

```typescript
// ✅ After — only traverses children (downward), no cycle possible
private buildCategoryTree(category: Category): any {
  return {
    id: category.id,
    name: category.name,
    children: category.children.map(child =>
      this.buildCategoryTree(child),
    ),
  };
}
```

---

### Bug #2 — `maxRetries` set to 1000 in payment processing

**File:** `src/orders/orders.service.ts`

**Problem:** The field `private maxRetries = 1000` meant a worst-case wait of 1,000 × 100 ms = 100 seconds per payment attempt before the method could throw.

```typescript
// ❌ Before
private maxRetries = 1000;
```

```typescript
// ✅ After — cap retries at a reasonable value
private maxRetries = 3;
```

---

### Bug #3 — Circular reference crashes `getOrderWithFullDetails`

**File:** `src/orders/orders.service.ts`

**Problem:** Assigning `enriched.user.latestOrder = enriched` created a circular object reference. The subsequent `JSON.stringify(enriched)` always threw `TypeError: Converting circular structure to JSON`.

```typescript
// ❌ Before
const enriched = { ...order };
enriched.user = {
  id: order.user.id,
  name: order.user.name,
  email: order.user.email,
  latestOrder: enriched, // ← self-reference; JSON.stringify throws
};
return JSON.parse(JSON.stringify(enriched));
```

```typescript
// ✅ After — build a plain object with only the fields needed, no circular refs
const enriched = {
  ...order,
  user: {
    id: order.user.id,
    name: order.user.name,
    email: order.user.email,
  },
};
return enriched;
```

---

### Bug #4 — Redis configured without connection timeouts

**File:** `src/app.module.ts`

**Problem:** Without `commandTimeout` and `enableOfflineQueue: false`, `ioredis` queued every Redis command indefinitely when Redis was unreachable, hanging all HTTP handlers that touched the cache.

```typescript
// ❌ Before — no timeout options
store: redisStore,
host: 'localhost',
port: 6379,
```

```typescript
// ✅ After — fail fast when Redis is down
store: redisStore,
host: 'localhost',
port: 6379,
commandTimeout: 2000,
maxRetriesPerRequest: 3,
enableOfflineQueue: false,
```

---

## 🟠 High

### Bug #5 — Missing `await` on `updateStock()`

**File:** `src/orders/orders.service.ts`

**Problem:** The call returned a `Promise` that was immediately discarded. The stock write happened asynchronously (or not at all if it errored), while the response was already sent.

```typescript
// ❌ Before
this.productsService.updateStock(item.productId, product.stock - item.quantity);
```

```typescript
// ✅ After
await this.productsService.updateStock(item.productId, product.stock - item.quantity);
```

---

### Bug #6 — No transaction wrapping order creation

**File:** `src/orders/orders.service.ts`

**Problem:** Independent `save()` calls were not atomic. A failure after the `Order` was inserted but before all `OrderItem` rows were saved left orphan rows in the database.

```typescript
// ❌ Before — non-atomic saves
const order = await this.ordersRepository.save(newOrder);
for (const item of createOrderDto.items) {
  await this.orderItemsRepository.save(newItem);
}
```

```typescript
// ✅ After — wrap everything in a DataSource transaction
return await this.dataSource.transaction(async (manager) => {
  const order = await manager.save(Order, newOrder);
  for (const item of createOrderDto.items) {
    await manager.save(OrderItem, newItem);
  }
  return order;
});
```

---

### Bug #7 — `remove()` called with a plain cached object

**File:** `src/users/users.service.ts`

**Problem:** `findOne` could return a raw JSON object deserialized from Redis. TypeORM's `Repository.remove()` requires a managed entity instance; passing a plain object caused it to fail silently or throw when the cache was hot.

```typescript
// ❌ Before — user might be a plain JS object from Redis
const user = await this.findOne(id);
await this.usersRepository.remove(user);
```

```typescript
// ✅ After — use delete(id) which accepts a plain ID, no entity instance needed
const user = await this.findOne(id); // still needed to 404 if missing
await this.usersRepository.delete(id);
```

---

### Bug #8 — No cascade delete on User→Orders

**File:** `src/orders/order.entity.ts`

**Problem:** Deleting a `User` with associated `Order` rows raised a PostgreSQL foreign-key constraint error because the default `RESTRICT` action was in effect.

```typescript
// ❌ Before
@ManyToOne(() => User, (user) => user.orders)
user: User;
```

```typescript
// ✅ After — automatically delete orders when the parent user is deleted
@ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
user: User;
```

---

### Bug #9 — Race condition in stock updates

**File:** `src/orders/orders.service.ts`

**Problem:** Two concurrent requests could both read `stock = 10`, both subtract and compute `8`, and both write `8` back — losing one deduction. The fix is a database-level pessimistic lock so only one transaction can hold the row at a time.

```typescript
// ❌ Before — read-modify-write in application memory
const product = await this.productsRepository.findOne({ where: { id } });
product.stock -= quantity;
await this.productsRepository.save(product);
```

```typescript
// ✅ After — use a pessimistic write lock inside a transaction
const product = await manager.findOne(Product, {
  where: { id: item.productId },
  lock: { mode: 'pessimistic_write' },
});
product.stock -= item.quantity;
await manager.save(Product, product);
```

---

### Bug #10 — `ValidationPipe` missing `whitelist: true`

**File:** `src/main.ts`

**Problem:** Without `whitelist: true`, `ValidationPipe` forwarded every property in the request body—including undeclared fields like `id` or `isActive`—straight to the service, allowing clients to set protected fields.

```typescript
// ❌ Before
app.useGlobalPipes(new ValidationPipe());
```

```typescript
// ✅ After — strip unknown fields and forbid extra properties
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

---

## 🟡 Medium

### Bug #11 — Static cache key in `searchProducts`

**File:** `src/products/products.service.ts`

**Problem:** The constant key `'product-search'` was shared by every query term. The first search populated the key; all subsequent searches returned the same cached result regardless of their term.

```typescript
// ❌ Before
const cacheKey = 'product-search';
```

```typescript
// ✅ After — include the (lowercased) query term in the key
const cacheKey = `product-search:${query.toLowerCase()}`;
```

---

### Bug #12 — In-memory filtering instead of database query

**File:** `src/products/products.service.ts`

**Problem:** `find()` with no clause loaded every row; JavaScript `.filter()` then scanned them all in the Node.js process, wasting memory and ignoring the database index.

```typescript
// ❌ Before
const allProducts = await this.productsRepository.find();
return allProducts.filter(p =>
  p.name.toLowerCase().includes(query.toLowerCase()),
);
```

```typescript
// ✅ After — push the predicate into the database with ILike
import { ILike } from 'typeorm';

const products = await this.productsRepository.find({
  where: { name: ILike(`%${query}%`) },
  relations: ['category'],
});
```

---

### Bug #13 — No cache invalidation on product mutations

**File:** `src/products/products.service.ts`

**Problem:** `create()` and `remove()` did not call `cacheManager.clear()` after writing to the database, so stale search results lived in Redis for the full TTL.

```typescript
// ❌ Before — create() returns without touching the cache
async create(dto: CreateProductDto): Promise<Product> {
  const product = this.productsRepository.create(dto);
  return this.productsRepository.save(product);
}
```

```typescript
// ✅ After — clear the product search cache after every mutation
async create(dto: CreateProductDto): Promise<Product> {
  const product = this.productsRepository.create(dto);
  const saved = await this.productsRepository.save(product);
  await this.cacheManager.clear(); // invalidate all product-search:* keys
  return saved;
}
```

---

### Bug #14 — N+1 pattern in `processProductBatch`

**File:** `src/products/products.service.ts`

**Problem:** For each product ID the service issued a `SELECT` then an `UPDATE`, totalling 2N round-trips. A single bulk `UPDATE … WHERE id IN (…)` achieves the same result in one query.

```typescript
// ❌ Before — 2N queries
for (const id of productIds) {
  const product = await this.findOne(id);
  product.updatedAt = new Date();
  await this.productsRepository.save(product);
}
```

```typescript
// ✅ After — single bulk UPDATE
const result = await this.productsRepository
  .createQueryBuilder()
  .update(Product)
  .set({ updatedAt: new Date() })
  .whereInIds(productIds)
  .execute();

return { success: true, processed: result.affected ?? 0 };
```

---

### Bug #15 — ~3N queries per order item in `create()`

**File:** `src/orders/orders.service.ts`

**Problem:** Each iteration of the items loop called `findOne(Product)`, `save(OrderItem)`, and `save(Product)` sequentially. Moving all stock reads inside the same transaction and batch-saving items reduces this to a bounded number of queries.

```typescript
// ❌ Before — sequential per-item round-trips
for (const item of createOrderDto.items) {
  const product = await this.productsService.findOne(item.productId);
  await this.orderItemsRepository.save(orderItem);
  await this.productsService.updateStock(item.productId, newStock);
}
```

```typescript
// ✅ After — all inside one transaction, using manager.findOne and manager.save
await this.dataSource.transaction(async (manager) => {
  for (const item of createOrderDto.items) {
    const product = await manager.findOne(Product, {
      where: { id: item.productId },
    });
    await manager.save(OrderItem, orderItem);
    await manager.save(Product, { ...product, stock: product.stock - item.quantity });
  }
});
```

---

### Bug #16 — `eager: true` on Order entity relations

**File:** `src/orders/order.entity.ts`

**Problem:** `eager: true` caused TypeORM to join `user` and `items` automatically on every query. Because the service also listed them in the `relations` array, the join was issued twice per query.

```typescript
// ❌ Before
@ManyToOne(() => User, { eager: true })
user: User;

@OneToMany(() => OrderItem, { eager: true })
items: OrderItem[];
```

```typescript
// ✅ After — remove eager; rely on explicit relations in service calls
@ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
user: User;

@OneToMany(() => OrderItem, (item) => item.order)
items: OrderItem[];
```

---

### Bug #17 — `eager: true` on OrderItem→Product and Product→Category relations

**File:** `src/orders/order-item.entity.ts` · `src/products/product.entity.ts`

**Problem:** Same mechanism as bug #16. Removing the `eager` flag and letting callers control relation loading eliminates the duplicate JOINs.

```typescript
// ❌ Before — order-item.entity.ts
@ManyToOne(() => Product, { eager: true })
product: Product;

// ❌ Before — product.entity.ts
@ManyToOne(() => Category, { eager: true })
category: Category;
```

```typescript
// ✅ After — order-item.entity.ts
@ManyToOne(() => Product, (product) => product.orderItems)
product: Product;

// ✅ After — product.entity.ts
@ManyToOne(() => Category, (category) => category.products)
category: Category;
```

---

## 🟢 Low

### Bug #18 — Duplicate email returns 500 instead of 409

**File:** `src/users/users.service.ts`

**Problem:** The raw PostgreSQL `QueryFailedError` (code `23505`) was not caught, so NestJS returned a generic 500. Wrapping the `save()` in a `try/catch` that inspects the error code allows the service to return a proper 409.

```typescript
// ❌ Before
return await this.usersRepository.save(user);
```

```typescript
// ✅ After
try {
  return await this.usersRepository.save(user);
} catch (error) {
  if (error.code === '23505') {
    throw new ConflictException('Email already exists');
  }
  throw error;
}
```

---

### Bug #19 — Redis deserialization loses `Date` types

**File:** `src/users/users.service.ts`

**Problem:** `JSON.parse` has no type hints, so `Date` instances stored as ISO strings come back as plain strings. The fix reconstructs `Date` fields explicitly after deserializing from the cache.

```typescript
// ❌ Before — returns whatever JSON.parse produces
const cached = await this.cacheManager.get<User>(`user:${id}`);
if (cached) return cached;
```

```typescript
// ✅ After — rehydrate Date fields after a cache hit
const cached = await this.cacheManager.get<User>(`user:${id}`);
if (cached) {
  return {
    ...cached,
    createdAt: new Date(cached.createdAt),
  };
}
```

---

### Bug #20 — Errors swallowed in `processProductBatch`

**File:** `src/products/products.service.ts`

**Problem:** The inner `catch` logged a message with no context; the outer `catch` threw a generic exception. Neither gave the caller any information about which product IDs failed or the underlying error.

```typescript
// ❌ Before
} catch (error) {
  console.log('Error processing product');
}
```

```typescript
// ✅ After — log the product ID and error, accumulate failed IDs for the response
} catch (error) {
  console.error(`Failed to process product ${id}:`, error.message);
  failed.push(id);
}
```

---

### Bug #21 — `CACHE_MANAGER` injected but never used in `OrdersService`

**File:** `src/orders/orders.service.ts`

**Problem:** The injection wired the Redis store but no method used it, so order queries were never cached. The fix is to actually use the cache manager in `findAll` and `findOne`, similar to `UsersService`.

```typescript
// ❌ Before — injected and immediately unused
constructor(
  // ...
  @Inject(CACHE_MANAGER) private cacheManager: Cache,
) {}

// No method calls this.cacheManager.*
```

```typescript
// ✅ After — use the cache in read methods
async findOne(id: number): Promise<Order> {
  const cacheKey = `order:${id}`;
  const cached = await this.cacheManager.get<Order>(cacheKey);
  if (cached) return cached;

  const order = await this.ordersRepository.findOne({
    where: { id },
    relations: ['user', 'items', 'items.product'],
  });
  if (!order) throw new NotFoundException(`Order #${id} not found`);

  await this.cacheManager.set(cacheKey, order, 30000);
  return order;
}
```

---

### Bug #22 — `updateStatus` allows illegal state-machine transitions

**File:** `src/orders/orders.service.ts`

**Problem:** Any status could be written over any current status unconditionally. A transition map that only allows forward moves prevents orders from being reverted to earlier states.

```typescript
// ❌ Before — no transition guard
order.status = status;
return this.ordersRepository.save(order);
```

```typescript
// ✅ After — enforce a state machine
const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]:   [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]:   [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

if (!ALLOWED[order.status].includes(status)) {
  throw new BadRequestException(
    `Cannot transition from ${order.status} to ${status}`,
  );
}
order.status = status;
return this.ordersRepository.save(order);
```

---

### Bug #23 — `processPayment` does not check current order status

**File:** `src/orders/orders.service.ts`

**Problem:** Nothing prevented calling `processPayment` on an already-confirmed or cancelled order, which could trigger a double charge.

```typescript
// ❌ Before — no status guard
const order = await this.findOne(orderId);
// immediately calls the payment provider
```

```typescript
// ✅ After — gate on PENDING status
const order = await this.findOne(orderId);
if (order.status !== OrderStatus.PENDING) {
  throw new BadRequestException(
    `Cannot process payment for an order with status "${order.status}"`,
  );
}
```

---

### Bug #24 — `userId` query param not validated in orders controller

**File:** `src/orders/orders.controller.ts`

**Problem:** `parseInt('abc', 10)` returns `NaN`, which was passed directly to the repository and produced a malformed SQL `WHERE` clause.

```typescript
// ❌ Before
@Get()
findAll(@Query('userId') userId: string) {
  if (userId) {
    return this.ordersService.findByUser(parseInt(userId, 10));
  }
  return this.ordersService.findAll();
}
```

```typescript
// ✅ After — validate and reject NaN early
@Get()
findAll(@Query('userId') userId?: string) {
  if (userId !== undefined) {
    const parsed = parseInt(userId, 10);
    if (isNaN(parsed)) {
      throw new BadRequestException('userId must be a valid integer');
    }
    return this.ordersService.findByUser(parsed);
  }
  return this.ordersService.findAll();
}
```

---

### Bug #25 — `updateStatus` endpoint accepts any string as status

**File:** `src/orders/orders.controller.ts`

**Problem:** `@Body('status') status: OrderStatus` had no runtime validation. Any string passed through to the service and was persisted in the database column.

```typescript
// ❌ Before — raw body field, no DTO validation
@Patch(':id/status')
updateStatus(
  @Param('id') id: string,
  @Body('status') status: OrderStatus,
) { ... }
```

```typescript
// ✅ After — introduce an UpdateOrderStatusDto with @IsEnum

// src/orders/dto/update-order-status.dto.ts
import { IsEnum } from 'class-validator';
import { OrderStatus } from '../order.entity';

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

// orders.controller.ts
@Patch(':id/status')
updateStatus(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateOrderStatusDto,
) {
  return this.ordersService.updateStatus(id, dto.status);
}
```
