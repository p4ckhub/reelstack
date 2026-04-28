import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mockCharacterFindUnique,
  mockCharacterUpsert,
  mockReferenceImageFindFirst,
  mockReferenceImageCreate,
  mockReferenceImageUpdateMany,
} from './prisma-mock';

vi.mock('@prisma/client', async () => {
  const { prismaMockFactory } = await import('./prisma-mock');
  return prismaMockFactory();
});

const { getCharacterBySlug, getPrimaryReferenceUrl, upsertCharacter, addReferenceImage } =
  await import('../reference-bank');

describe('reference-bank', () => {
  beforeEach(() => {
    mockCharacterFindUnique.mockReset();
    mockCharacterUpsert.mockReset();
    mockReferenceImageFindFirst.mockReset();
    mockReferenceImageCreate.mockReset();
    mockReferenceImageUpdateMany.mockReset();
  });

  describe('getCharacterBySlug', () => {
    it('returns the character when slug exists', async () => {
      const row = { id: 'c1', slug: 'cyber-retro', name: 'Cyber Retro' };
      mockCharacterFindUnique.mockResolvedValueOnce(row);

      const result = await getCharacterBySlug('cyber-retro');

      expect(result).toEqual(row);
      expect(mockCharacterFindUnique).toHaveBeenCalledWith({ where: { slug: 'cyber-retro' } });
    });

    it('returns null when slug does not exist', async () => {
      mockCharacterFindUnique.mockResolvedValueOnce(null);

      const result = await getCharacterBySlug('missing-persona');

      expect(result).toBeNull();
    });
  });

  describe('getPrimaryReferenceUrl', () => {
    it('returns the primary portrait URL by default', async () => {
      mockCharacterFindUnique.mockResolvedValueOnce({ id: 'c1' });
      mockReferenceImageFindFirst.mockResolvedValueOnce({ url: 'https://cdn/cyber-retro.jpg' });

      const url = await getPrimaryReferenceUrl('cyber-retro');

      expect(url).toBe('https://cdn/cyber-retro.jpg');
      expect(mockReferenceImageFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { characterId: 'c1', kind: 'portrait', isPrimary: true },
        })
      );
    });

    it('returns null when character is missing — never throws', async () => {
      mockCharacterFindUnique.mockResolvedValueOnce(null);

      const url = await getPrimaryReferenceUrl('missing-persona');

      expect(url).toBeNull();
      expect(mockReferenceImageFindFirst).not.toHaveBeenCalled();
    });

    it('returns null when character exists but has no primary reference of that kind', async () => {
      mockCharacterFindUnique.mockResolvedValueOnce({ id: 'c1' });
      mockReferenceImageFindFirst.mockResolvedValueOnce(null);

      const url = await getPrimaryReferenceUrl('cyber-retro', 'fullbody');

      expect(url).toBeNull();
      expect(mockReferenceImageFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { characterId: 'c1', kind: 'fullbody', isPrimary: true },
        })
      );
    });

    it('respects custom kind argument', async () => {
      mockCharacterFindUnique.mockResolvedValueOnce({ id: 'c1' });
      mockReferenceImageFindFirst.mockResolvedValueOnce({ url: 'https://cdn/env.jpg' });

      const url = await getPrimaryReferenceUrl('cyber-retro', 'environment');

      expect(url).toBe('https://cdn/env.jpg');
    });
  });

  describe('upsertCharacter', () => {
    it('creates a global character when ownerUserId is omitted', async () => {
      const row = { id: 'c1', slug: 'clean-corporate' };
      mockCharacterUpsert.mockResolvedValueOnce(row);

      const result = await upsertCharacter({ slug: 'clean-corporate', name: 'Clean Corporate' });

      expect(result).toEqual(row);
      expect(mockCharacterUpsert).toHaveBeenCalledWith({
        where: { slug: 'clean-corporate' },
        create: {
          slug: 'clean-corporate',
          name: 'Clean Corporate',
          description: null,
          ownerUserId: null,
        },
        update: {
          name: 'Clean Corporate',
          description: null,
          ownerUserId: null,
        },
      });
    });

    it('scopes character to ownerUserId when provided', async () => {
      mockCharacterUpsert.mockResolvedValueOnce({});

      await upsertCharacter({
        slug: 'pavel-custom',
        name: 'Pavel Custom',
        description: 'Personal twin',
        ownerUserId: 'user-1',
      });

      expect(mockCharacterUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ ownerUserId: 'user-1', description: 'Personal twin' }),
        })
      );
    });
  });

  describe('addReferenceImage', () => {
    it('demotes existing primary before inserting a new primary of same kind', async () => {
      mockReferenceImageUpdateMany.mockResolvedValueOnce({ count: 1 });
      mockReferenceImageCreate.mockResolvedValueOnce({ id: 'r1' });

      await addReferenceImage({
        characterId: 'c1',
        url: 'https://cdn/new.jpg',
        kind: 'portrait',
        isPrimary: true,
      });

      expect(mockReferenceImageUpdateMany).toHaveBeenCalledWith({
        where: { characterId: 'c1', kind: 'portrait', isPrimary: true },
        data: { isPrimary: false },
      });
      expect(mockReferenceImageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ isPrimary: true, url: 'https://cdn/new.jpg' }),
      });
    });

    it('does not demote anything when isPrimary is false', async () => {
      mockReferenceImageCreate.mockResolvedValueOnce({ id: 'r1' });

      await addReferenceImage({ characterId: 'c1', url: 'https://cdn/extra.jpg' });

      expect(mockReferenceImageUpdateMany).not.toHaveBeenCalled();
      expect(mockReferenceImageCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          isPrimary: false,
          kind: 'portrait',
          url: 'https://cdn/extra.jpg',
        }),
      });
    });
  });
});
