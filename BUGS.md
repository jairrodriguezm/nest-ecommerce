# Bug Report

Comprehensive list of bugs identified in the microservice, organized by priority level.

---

## 🔴 Critical (Crashes or infinite requests)

| # | Bug | File | Symptom |
|---|-----|------|---------|
| 1 | Infinite recursion in `buildCategoryTree` — traverses both parent and children creating a cycle that causes stack overflow | `products/products.service.ts` | Requests never complete |
| 2 | `maxRetries` set to `1000` in payment processing — with 100ms delay per retry, a failing payment hangs for up to 100 seconds | `orders/orders.service.ts` | Requests extremely slow |
| 3 | Circular reference in `getOrderWithFullDetails` — assigns `enriched.user.latestOrder = enriched` then calls `JSON.stringify()`, which always throws `TypeError` | `orders/orders.service.ts` | 500 error on every call |
| 4 | Redis store configured without connection timeouts — if Redis goes down, all cache calls queue indefinitely and hang HTTP requests | `app.module.ts` | Requests never complete |

---

## 🟠 High (Data corruption or intermittent errors)

| # | Bug | File | Symptom |
|---|-----|------|---------|
| 5 | Missing `await` on `updateStock()` call during order creation — stock updates fail silently | `orders/orders.service.ts` | Data inconsistent |
| 6 | No database transaction wrapping order creation — if the process fails midway, partial data remains in the database | `orders/orders.service.ts` | Data inconsistent |
| 7 | `usersRepository.remove()` receives a plain cached object instead of a TypeORM entity — fails intermittently depending on cache state | `users/users.service.ts` | Intermittent errors |
| 8 | No cascade delete policy on User→Orders relationship — deleting a user with orders throws a foreign key constraint error | `orders/order.entity.ts` | Intermittent errors |
| 9 | Race condition in stock updates — stock is calculated in application memory, so concurrent orders can read the same value and lose a deduction | `orders/orders.service.ts` | Data inconsistent |
| 10 | `ValidationPipe` missing `whitelist: true` — clients can inject restricted fields like `id`, `isActive`, or `createdAt` in request bodies | `main.ts` | Data inconsistent |

---

## 🟡 Medium (Performance and cache issues)

| # | Bug | File | Symptom |
|---|-----|------|---------|
| 11 | Static cache key `'product-search'` in `searchProducts` — all different search queries return the same cached result | `products/products.service.ts` | Cache mismatch |
| 12 | Search loads entire products table into memory and filters with JavaScript `.filter()` instead of querying the database | `products/products.service.ts` | Requests extremely slow |
| 13 | No cache invalidation when products are created, updated, or deleted — users see stale data until TTL expires | `products/products.service.ts` | Cache mismatch |
| 14 | Batch processing uses sequential `findOne` + `save` in a loop (N+1 pattern) | `products/products.service.ts` | Requests slow |
| 15 | Order creation performs individual `findOne` + `save` + `updateStock` queries per item in a loop (~3N queries) | `orders/orders.service.ts` | Requests slow |
| 16 | `eager: true` on Order entity relations (`user`, `items`) while the service also requests them explicitly — causes redundant queries | `orders/order.entity.ts` | Requests slow |
| 17 | `eager: true` on OrderItem→Product relation — same redundancy issue | `orders/order-item.entity.ts` | Requests slow |

---

## 🟢 Low (Robustness improvements)

| # | Bug | File | Symptom |
|---|-----|------|---------|
| 18 | Unique constraint violation on user email throws generic 500 instead of 409 Conflict | `users/users.service.ts` | Vague error messages |
| 19 | Cached objects lose `Date` types after Redis serialization — `createdAt` returns as string instead of `Date` | `users/users.service.ts` | Cache mismatch |
| 20 | Errors swallowed in `processProductBatch` — individual failures logged with `console.log` and outer catch throws generic `BadRequestException` | `products/products.service.ts` | Vague error messages |
| 21 | `CACHE_MANAGER` injected in orders service but never used in any method | `orders/orders.service.ts` | Cache mismatch |
| 22 | `updateStatus` accepts any status value without validating state machine transitions — an order can go from `DELIVERED` back to `PENDING` | `orders/orders.service.ts` | Data inconsistent |
| 23 | `processPayment` does not check current order status — an already paid or cancelled order can be charged again | `orders/orders.service.ts` | Data inconsistent |
| 24 | `findAll` in orders controller does not validate `userId` query param — `parseInt('abc')` returns `NaN` causing unexpected DB behavior | `orders/orders.controller.ts` | Data inconsistent |
| 25 | `updateStatus` endpoint accepts raw `@Body('status')` without DTO or `@IsEnum()` validation — invalid status values pass through to the service | `orders/orders.controller.ts` | Data inconsistent |
