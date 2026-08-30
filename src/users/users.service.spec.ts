import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

import { UsersService } from './users.service';
import { User } from './user.entity';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser: User = {
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  isActive: true,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  orders: [],
};

// ─── Mock factories ───────────────────────────────────────────────────────────

const mockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

const mockCacheManager = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof mockRepository>;
  let cache: ReturnType<typeof mockCacheManager>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
        { provide: CACHE_MANAGER, useFactory: mockCacheManager },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get(getRepositoryToken(User));
    cache = module.get(CACHE_MANAGER);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return cached users when cache is populated (cache hit)', async () => {
      cache.get.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(cache.get).toHaveBeenCalledWith('users:all');
      expect(result).toEqual([mockUser]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('should fetch from DB and populate cache when cache is empty (cache miss)', async () => {
      cache.get.mockResolvedValue(null);
      repo.find.mockResolvedValue([mockUser]);

      const result = await service.findAll();

      expect(repo.find).toHaveBeenCalled();
      expect(cache.set).toHaveBeenCalledWith('users:all', [mockUser], 60000);
      expect(result).toEqual([mockUser]);
    });

    it('should return an empty array when no users exist', async () => {
      cache.get.mockResolvedValue(null);
      repo.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return the cached user when cache is populated (cache hit)', async () => {
      cache.get.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(cache.get).toHaveBeenCalledWith('user:1');
      expect(result).toEqual(mockUser);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('should fetch from DB and cache the user when cache is empty (cache miss)', async () => {
      cache.get.mockResolvedValue(null);
      repo.findOne.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(cache.set).toHaveBeenCalledWith('user:1', mockUser, 60000);
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      cache.get.mockResolvedValue(null);
      repo.findOne.mockResolvedValue(null);

      await expect(service.findOne(99)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(99)).rejects.toThrow('User #99 not found');
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = { email: 'new@example.com', name: 'New User' };

    it('should create a user and invalidate the users:all cache', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      const result = await service.create(dto);

      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalledWith('users:all');
      expect(result).toEqual(mockUser);
    });

    it('should throw ConflictException on duplicate email (PostgreSQL error 23505)', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockRejectedValue({ code: '23505' });

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
      await expect(service.create(dto)).rejects.toThrow('Email already exists');
    });

    it('should rethrow any other unexpected database error', async () => {
      repo.create.mockReturnValue(mockUser);
      const unexpectedError = new Error('Database connection lost');
      repo.save.mockRejectedValue(unexpectedError);

      await expect(service.create(dto)).rejects.toThrow('Database connection lost');
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should delete the user and invalidate related cache keys', async () => {
      cache.get.mockResolvedValue(mockUser);
      repo.delete.mockResolvedValue({ affected: 1 });

      await service.remove(1);

      expect(repo.delete).toHaveBeenCalledWith(1);
      expect(cache.del).toHaveBeenCalledWith('users:all');
      expect(cache.del).toHaveBeenCalledWith('user:1');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      cache.get.mockResolvedValue(null);
      repo.findOne.mockResolvedValue(null);

      await expect(service.remove(99)).rejects.toThrow(NotFoundException);
      expect(repo.delete).not.toHaveBeenCalled();
    });
  });
});
