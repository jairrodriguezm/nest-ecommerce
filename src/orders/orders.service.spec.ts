import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';

import { OrdersService } from './orders.service';
import { Order, OrderStatus } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Product } from '../products/product.entity';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = {
  id: 1,
  email: 'user@example.com',
  name: 'Test User',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  orders: [],
};

const mockProduct: Partial<Product> = {
  id: 1,
  name: 'Test Product',
  price: 10.0,
  stock: 20,
  isAvailable: true,
};

const mockOrderItem: Partial<OrderItem> = {
  id: 1,
  orderId: 1,
  productId: 1,
  quantity: 2,
  price: 10.0,
};

const mockOrder: Partial<Order> = {
  id: 1,
  status: OrderStatus.PENDING,
  total: 20,
  userId: 1,
  user: mockUser as any,
  items: [mockOrderItem as OrderItem],
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
};

// ─── Mock factories ───────────────────────────────────────────────────────────

// EntityManager mock (used inside DataSource.transaction callback)
const mockManager = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn().mockImplementation(async (cb: (em: typeof mockManager) => any) =>
    cb(mockManager),
  ),
};

const mockOrdersRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
});

const mockOrderItemsRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
});

const mockUsersService = {
  findOne: jest.fn(),
};

const mockProductsService = {
  findOne: jest.fn(),
  updateStock: jest.fn(),
};

const mockCacheManager = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OrdersService', () => {
  let service: OrdersService;
  let ordersRepo: ReturnType<typeof mockOrdersRepository>;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useFactory: mockOrdersRepository },
        { provide: getRepositoryToken(OrderItem), useFactory: mockOrderItemsRepository },
        { provide: DataSource, useValue: mockDataSource },
        { provide: UsersService, useValue: mockUsersService },
        { provide: ProductsService, useValue: mockProductsService },
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    ordersRepo = module.get(getRepositoryToken(Order));
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all orders with user, items and product relations', async () => {
      ordersRepo.find.mockResolvedValue([mockOrder]);

      const result = await service.findAll();

      expect(ordersRepo.find).toHaveBeenCalledWith({
        relations: ['user', 'items', 'items.product'],
      });
      expect(result).toEqual([mockOrder]);
    });

    it('should return an empty array when no orders exist', async () => {
      ordersRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return an order with full relations by ID', async () => {
      ordersRepo.findOne.mockResolvedValue(mockOrder);

      const result = await service.findOne(1);

      expect(ordersRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['user', 'items', 'items.product'],
      });
      expect(result).toEqual(mockOrder);
    });

    it('should throw NotFoundException when order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(99)).rejects.toThrow('Order #99 not found');
    });
  });

  // ── findByUser ─────────────────────────────────────────────────────────────

  describe('findByUser', () => {
    it('should return all orders for a specific user', async () => {
      ordersRepo.find.mockResolvedValue([mockOrder]);

      const result = await service.findByUser(1);

      expect(ordersRepo.find).toHaveBeenCalledWith({
        where: { userId: 1 },
        relations: ['items', 'items.product'],
      });
      expect(result).toEqual([mockOrder]);
    });

    it('should return empty array if the user has no orders', async () => {
      ordersRepo.find.mockResolvedValue([]);

      const result = await service.findByUser(99);

      expect(result).toEqual([]);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const createDto = {
      userId: 1,
      items: [{ productId: 1, quantity: 2 }],
    };

    beforeEach(() => {
      // User is found
      mockUsersService.findOne.mockResolvedValue(mockUser);

      // manager.create(Order) returns bare order, manager.save(Order) saves it
      mockManager.create
        .mockReturnValueOnce({ id: 1, userId: 1, status: OrderStatus.PENDING, total: 0 }) // Order
        .mockReturnValueOnce(mockOrderItem); // OrderItem

      mockManager.save
        .mockResolvedValueOnce({ id: 1, userId: 1, status: OrderStatus.PENDING, total: 0 }) // saved Order
        .mockResolvedValueOnce(mockOrderItem)   // saved OrderItem
        .mockResolvedValueOnce({ ...mockProduct, stock: 18 }) // saved Product (stock updated)
        .mockResolvedValueOnce({ id: 1, userId: 1, status: OrderStatus.PENDING, total: 20 }); // Order with total

      // product found inside transaction
      mockManager.findOne.mockResolvedValue({ ...mockProduct });

      // final findOne to return the full order after transaction
      ordersRepo.findOne.mockResolvedValue(mockOrder);
    });

    it('should create an order inside a DB transaction and return the full order', async () => {
      const result = await service.create(createDto);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockUsersService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockOrder);
    });

    it('should deduct stock from the product inside the transaction', async () => {
      await service.create(createDto);

      // Product should be saved with reduced stock: 20 - 2 = 18
      expect(mockManager.save).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ stock: 18 }),
      );
    });

    it('should throw NotFoundException when the user does not exist', async () => {
      mockUsersService.findOne.mockRejectedValue(new NotFoundException('User #99 not found'));

      await expect(service.create({ ...createDto, userId: 99 })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when a product does not exist', async () => {
      mockManager.findOne.mockResolvedValue(null); // product not found

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when stock is insufficient', async () => {
      mockManager.findOne.mockResolvedValue({ ...mockProduct, stock: 1 }); // only 1 in stock

      await expect(
        service.create({ userId: 1, items: [{ productId: 1, quantity: 5 }] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateStatus ───────────────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should update the order status', async () => {
      const pendingOrder = { ...mockOrder, status: OrderStatus.PENDING };
      const confirmedOrder = { ...mockOrder, status: OrderStatus.CONFIRMED };

      ordersRepo.findOne.mockResolvedValue(pendingOrder);
      ordersRepo.save.mockResolvedValue(confirmedOrder);

      const result = await service.updateStatus(1, OrderStatus.CONFIRMED);

      expect(ordersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.CONFIRMED }),
      );
      expect(result.status).toBe(OrderStatus.CONFIRMED);
    });

    it('should throw NotFoundException if order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.updateStatus(99, OrderStatus.CONFIRMED)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── processPayment ─────────────────────────────────────────────────────────

  describe('processPayment', () => {
    // Use fake timers to avoid real 100ms delays in payment retries
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('should process payment and set order status to CONFIRMED on success', async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder, status: OrderStatus.PENDING });
      ordersRepo.save.mockResolvedValue({ ...mockOrder, status: OrderStatus.CONFIRMED });
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // > 0.1 → success

      const promise = service.processPayment(1);
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.transactionId).toMatch(/^TXN-/);
      expect(ordersRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.CONFIRMED }),
      );
    });

    it('should throw BadRequestException if order is not PENDING', async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder, status: OrderStatus.CONFIRMED });

      await expect(service.processPayment(1)).rejects.toThrow(BadRequestException);
    });

    it('should throw after exhausting all retries when payment service always fails', async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder, status: OrderStatus.PENDING });
      jest.spyOn(Math, 'random').mockReturnValue(0.05); // < 0.1 → always throws

      // Collect the rejection BEFORE advancing timers so it is already awaited
      const rejectionPromise = expect(service.processPayment(1)).rejects.toThrow(
        'Payment service unavailable',
      );
      await jest.runAllTimersAsync();
      await rejectionPromise;
    });

    it('should throw NotFoundException if order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.processPayment(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    beforeEach(() => {
      // Reset manager mocks so calls from the 'create' describe do not leak in
      mockManager.create.mockReset();
      mockManager.save.mockReset();
      mockManager.findOne.mockReset();

      // Transaction mock for cancel: restores stock and updates status
      mockManager.findOne.mockResolvedValue({ ...mockProduct });
      mockManager.save
        .mockResolvedValueOnce({ ...mockProduct, stock: 22 }) // restored stock
        .mockResolvedValueOnce({ ...mockOrder, status: OrderStatus.CANCELLED });
    });

    it('should cancel a PENDING order and restore product stock', async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder, status: OrderStatus.PENDING });

      const result = await service.cancel(1);

      expect(mockDataSource.transaction).toHaveBeenCalled();
      // Product stock should be restored: 20 + 2 = 22
      expect(mockManager.save).toHaveBeenCalledWith(
        Product,
        expect.objectContaining({ stock: 22 }),
      );
      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('should throw BadRequestException when trying to cancel a non-PENDING order', async () => {
      ordersRepo.findOne.mockResolvedValue({ ...mockOrder, status: OrderStatus.CONFIRMED });

      await expect(service.cancel(1)).rejects.toThrow(BadRequestException);
      await expect(service.cancel(1)).rejects.toThrow('Only pending orders can be cancelled');
    });

    it('should throw NotFoundException if order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.cancel(99)).rejects.toThrow(NotFoundException);
    });
  });


  // ── getOrderWithFullDetails ────────────────────────────────────────────────

  describe('getOrderWithFullDetails', () => {
    it('should return order with user fields id, name and email only', async () => {
      ordersRepo.findOne.mockResolvedValue(mockOrder);

      const result = await service.getOrderWithFullDetails(1);

      expect(result.user).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
      });
      // Sensitive fields should not be exposed
      expect(result.user.isActive).toBeUndefined();
      expect(result.user.createdAt).toBeUndefined();
    });

    it('should throw NotFoundException when order does not exist', async () => {
      ordersRepo.findOne.mockResolvedValue(null);

      await expect(service.getOrderWithFullDetails(99)).rejects.toThrow(NotFoundException);
    });

    it('should load relations including items.product.category', async () => {
      ordersRepo.findOne.mockResolvedValue(mockOrder);

      await service.getOrderWithFullDetails(1);

      expect(ordersRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['user', 'items', 'items.product', 'items.product.category'],
        }),
      );
    });
  });
});
