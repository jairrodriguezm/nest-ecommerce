import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

import { ProductsService } from './products.service';
import { Product } from './product.entity';
import { Category } from './category.entity';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockCategory = {
  id: 1,
  name: 'Electronics',
  description: 'Electronic products' as string | null,
  parentId: null as number | null,
  parent: null as any,
  children: [] as any[],
  products: [] as any[],
} as Category;


const mockProduct: Product = {
  id: 1,
  name: 'Test Product',
  description: 'A test product',
  price: 99.99,
  stock: 10,
  isAvailable: true,
  categoryId: 1,
  category: mockCategory,
  orderItems: [],
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockProductRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockCategoryRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockCacheManager = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  clear: jest.fn(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ProductsService', () => {
  let service: ProductsService;
  let productRepo: ReturnType<typeof mockProductRepository>;
  let categoryRepo: ReturnType<typeof mockCategoryRepository>;
  let cache: ReturnType<typeof mockCacheManager>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useFactory: mockProductRepository },
        { provide: getRepositoryToken(Category), useFactory: mockCategoryRepository },
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    productRepo = module.get(getRepositoryToken(Product));
    categoryRepo = module.get(getRepositoryToken(Category));
    cache = module.get(CACHE_MANAGER);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all products with category relation', async () => {
      productRepo.find.mockResolvedValue([mockProduct]);

      const result = await service.findAll();

      expect(productRepo.find).toHaveBeenCalledWith({ relations: ['category'] });
      expect(result).toEqual([mockProduct]);
    });

    it('should return empty array when no products exist', async () => {
      productRepo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return product with category relation by ID', async () => {
      productRepo.findOne.mockResolvedValue(mockProduct);

      const result = await service.findOne(1);

      expect(productRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['category'],
      });
      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundException when product does not exist', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(99)).rejects.toThrow('Product #99 not found');
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new product', async () => {
      const dto = { name: 'New Product', price: 49.99, stock: 20 };
      productRepo.create.mockReturnValue(mockProduct);
      productRepo.save.mockResolvedValue(mockProduct);

      const result = await service.create(dto as any);

      expect(productRepo.create).toHaveBeenCalledWith(dto);
      expect(productRepo.save).toHaveBeenCalled();
      expect(result).toEqual(mockProduct);
    });
  });

  // ── updateStock ────────────────────────────────────────────────────────────

  describe('updateStock', () => {
    it('should update the stock quantity of a product', async () => {
      const updatedProduct = { ...mockProduct, stock: 5 };
      productRepo.findOne.mockResolvedValue({ ...mockProduct });
      productRepo.save.mockResolvedValue(updatedProduct);

      const result = await service.updateStock(1, 5);

      expect(productRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ stock: 5 }),
      );
      expect(result.stock).toBe(5);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.updateStock(99, 5)).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should remove a product from the database', async () => {
      productRepo.findOne.mockResolvedValue(mockProduct);
      productRepo.remove.mockResolvedValue(mockProduct);

      await service.remove(1);

      expect(productRepo.remove).toHaveBeenCalledWith(mockProduct);
    });

    it('should throw NotFoundException if product does not exist', async () => {
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
      expect(productRepo.remove).not.toHaveBeenCalled();
    });
  });

  // ── searchProducts ─────────────────────────────────────────────────────────

  describe('searchProducts', () => {
    it('should return cached results on cache hit', async () => {
      cache.get.mockResolvedValue([mockProduct]);

      const result = await service.searchProducts('Test');

      // Cache key must be lowercased
      expect(cache.get).toHaveBeenCalledWith('product-search:test');
      expect(result).toEqual([mockProduct]);
      expect(productRepo.find).not.toHaveBeenCalled();
    });

    it('should query DB with ILike and cache results on cache miss', async () => {
      cache.get.mockResolvedValue(null);
      productRepo.find.mockResolvedValue([mockProduct]);

      const result = await service.searchProducts('TEST');

      expect(cache.get).toHaveBeenCalledWith('product-search:test');
      expect(productRepo.find).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledWith('product-search:test', [mockProduct], 60000);
      expect(result).toEqual([mockProduct]);
    });

    it('should return empty array when no products match the search', async () => {
      cache.get.mockResolvedValue(null);
      productRepo.find.mockResolvedValue([]);

      const result = await service.searchProducts('xyz-not-found');

      expect(result).toEqual([]);
    });
  });

  // ── getCategoryTree ────────────────────────────────────────────────────────

  describe('getCategoryTree', () => {
    it('should return a flat category with no children', async () => {
      categoryRepo.findOne.mockResolvedValue(mockCategory);

      const result = await service.getCategoryTree(1);

      expect(result).toEqual({
        id: 1,
        name: 'Electronics',
        children: [],
      });
    });

    it('should build a nested tree when category has children', async () => {
      const grandchild = {
        id: 3,
        name: 'Smartphones',
        description: null as any,
        parentId: 2,
        parent: null as any,
        children: [],
        products: [],
      } as Category;
      const child = {
        id: 2,
        name: 'Phones',
        description: null as any,
        parentId: 1,
        parent: mockCategory,
        children: [grandchild],
        products: [],
      } as Category;
      const rootWithChildren = { ...mockCategory, children: [child] } as Category;

      categoryRepo.findOne.mockResolvedValue(rootWithChildren);

      const result = await service.getCategoryTree(1);

      expect(result).toEqual({
        id: 1,
        name: 'Electronics',
        children: [
          {
            id: 2,
            name: 'Phones',
            children: [
              { id: 3, name: 'Smartphones', children: [] },
            ],
          },
        ],
      });
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.getCategoryTree(99)).rejects.toThrow(NotFoundException);
    });
  });

  // ── findAllCategories ──────────────────────────────────────────────────────

  describe('findAllCategories', () => {
    it('should return all categories with parent and children relations', async () => {
      categoryRepo.find.mockResolvedValue([mockCategory]);

      const result = await service.findAllCategories();

      expect(categoryRepo.find).toHaveBeenCalledWith({
        relations: ['parent', 'children'],
      });
      expect(result).toEqual([mockCategory]);
    });
  });

  // ── findCategory ───────────────────────────────────────────────────────────

  describe('findCategory', () => {
    it('should return a category with full relations', async () => {
      categoryRepo.findOne.mockResolvedValue(mockCategory);

      const result = await service.findCategory(1);

      expect(categoryRepo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['parent', 'children', 'products'],
      });
      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException when category does not exist', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(service.findCategory(99)).rejects.toThrow(NotFoundException);
      await expect(service.findCategory(99)).rejects.toThrow('Category #99 not found');
    });
  });

  // ── processProductBatch ────────────────────────────────────────────────────

  describe('processProductBatch', () => {
    /** Helper to set up the QueryBuilder chain mock */
    function setupQueryBuilderMock(affectedRows: number) {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: affectedRows }),
      };
      productRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);
      return mockQb;
    }

    it('should update all products in one query and return the affected count', async () => {
      const qb = setupQueryBuilderMock(3);

      const result = await service.processProductBatch([1, 2, 3]);

      expect(productRepo.createQueryBuilder).toHaveBeenCalled();
      expect(qb.update).toHaveBeenCalledWith(Product);
      expect(qb.set).toHaveBeenCalledWith(expect.objectContaining({ updatedAt: expect.any(Date) }));
      expect(qb.whereInIds).toHaveBeenCalledWith([1, 2, 3]);
      expect(qb.execute).toHaveBeenCalled();
      expect(result).toEqual({ success: true, processed: 3 });
    });

    it('should return processed:0 when no rows are affected', async () => {
      setupQueryBuilderMock(0);

      const result = await service.processProductBatch([99, 100]);

      expect(result).toEqual({ success: true, processed: 0 });
    });

    it('should throw BadRequestException when the query builder fails', async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        whereInIds: jest.fn().mockReturnThis(),
        execute: jest.fn().mockRejectedValue(new Error('DB error')),
      };
      productRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      await expect(service.processProductBatch([1, 2])).rejects.toThrow(
        'Batch processing failed',
      );
    });
  });
});

