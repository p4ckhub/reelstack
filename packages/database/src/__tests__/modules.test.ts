import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  prismaMockFactory,
  mockModuleFindUnique,
  mockModuleFindMany,
  mockUserModuleAccessFindUnique,
  mockUserModuleAccessFindMany,
  mockUserModuleAccessUpsert,
} from './prisma-mock';

vi.mock('@prisma/client', prismaMockFactory);

const { isUnlimited, canUserAccessModule, listAccessibleModules, grantModuleAccess } =
  await import('../modules');

const FREE_USER = { id: 'u1', tier: 'FREE' as const, isOwner: false };
const PRO_USER = { id: 'u2', tier: 'PRO' as const, isOwner: false };
const AGENCY_USER = { id: 'u3', tier: 'AGENCY' as const, isOwner: false };
const OWNER_USER = { id: 'u4', tier: 'FREE' as const, isOwner: true };

const SLIDESHOW = {
  id: 'm1',
  slug: 'slideshow',
  name: 'Slideshow',
  description: null,
  category: 'core',
  enabled: true,
  creditCost: 10,
  requiredTier: null,
  thumbnailUrl: null,
  previewUrl: null,
  bundleUrl: null,
  version: '1.0.0',
  createdAt: new Date(),
  updatedAt: new Date(),
};
const TALKING_HEAD = { ...SLIDESHOW, id: 'm2', slug: 'talking-head', requiredTier: 'PRO' as const };
const N8N_EXPLAINER = {
  ...SLIDESHOW,
  id: 'm3',
  slug: 'n8n-explainer',
  requiredTier: 'AGENCY' as const,
};

describe('isUnlimited', () => {
  it('returns true for owner', () => {
    expect(isUnlimited({ isOwner: true })).toBe(true);
  });
  it('returns false for non-owner', () => {
    expect(isUnlimited({ isOwner: false })).toBe(false);
  });
  it('returns false for null user', () => {
    expect(isUnlimited(null)).toBe(false);
    expect(isUnlimited(undefined)).toBe(false);
  });
});

describe('canUserAccessModule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('owner always has access (no DB lookup)', async () => {
    const allowed = await canUserAccessModule(OWNER_USER, 'n8n-explainer');
    expect(allowed).toBe(true);
    expect(mockModuleFindUnique).not.toHaveBeenCalled();
  });

  it('unknown module is denied', async () => {
    mockModuleFindUnique.mockResolvedValue(null);
    expect(await canUserAccessModule(FREE_USER, 'nonexistent')).toBe(false);
  });

  it('disabled module is denied even for matching tier', async () => {
    mockModuleFindUnique.mockResolvedValue({ ...SLIDESHOW, enabled: false });
    expect(await canUserAccessModule(FREE_USER, 'slideshow')).toBe(false);
  });

  it('explicit grant overrides requiredTier', async () => {
    mockModuleFindUnique.mockResolvedValue(N8N_EXPLAINER);
    mockUserModuleAccessFindUnique.mockResolvedValue({ expiresAt: null });
    expect(await canUserAccessModule(FREE_USER, 'n8n-explainer')).toBe(true);
  });

  it('expired grant does not apply', async () => {
    mockModuleFindUnique.mockResolvedValue(N8N_EXPLAINER);
    mockUserModuleAccessFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await canUserAccessModule(FREE_USER, 'n8n-explainer')).toBe(false);
  });

  it('future-expiry grant applies', async () => {
    mockModuleFindUnique.mockResolvedValue(N8N_EXPLAINER);
    mockUserModuleAccessFindUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });
    expect(await canUserAccessModule(FREE_USER, 'n8n-explainer')).toBe(true);
  });

  it('null requiredTier is open to everyone', async () => {
    mockModuleFindUnique.mockResolvedValue(SLIDESHOW);
    mockUserModuleAccessFindUnique.mockResolvedValue(null);
    expect(await canUserAccessModule(FREE_USER, 'slideshow')).toBe(true);
  });

  it('tier rank gate: PRO can access talking-head', async () => {
    mockModuleFindUnique.mockResolvedValue(TALKING_HEAD);
    mockUserModuleAccessFindUnique.mockResolvedValue(null);
    expect(await canUserAccessModule(PRO_USER, 'talking-head')).toBe(true);
  });

  it('tier rank gate: AGENCY can access talking-head (rank above)', async () => {
    mockModuleFindUnique.mockResolvedValue(TALKING_HEAD);
    mockUserModuleAccessFindUnique.mockResolvedValue(null);
    expect(await canUserAccessModule(AGENCY_USER, 'talking-head')).toBe(true);
  });

  it('tier rank gate: FREE cannot access talking-head', async () => {
    mockModuleFindUnique.mockResolvedValue(TALKING_HEAD);
    mockUserModuleAccessFindUnique.mockResolvedValue(null);
    expect(await canUserAccessModule(FREE_USER, 'talking-head')).toBe(false);
  });

  it('tier rank gate: PRO cannot access n8n-explainer (needs AGENCY)', async () => {
    mockModuleFindUnique.mockResolvedValue(N8N_EXPLAINER);
    mockUserModuleAccessFindUnique.mockResolvedValue(null);
    expect(await canUserAccessModule(PRO_USER, 'n8n-explainer')).toBe(false);
  });
});

describe('listAccessibleModules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('owner sees every enabled module without DB grant lookup', async () => {
    const allModules = [SLIDESHOW, TALKING_HEAD, N8N_EXPLAINER];
    mockModuleFindMany.mockResolvedValue(allModules);
    const list = await listAccessibleModules(OWNER_USER);
    expect(list).toEqual(allModules);
    expect(mockUserModuleAccessFindMany).not.toHaveBeenCalled();
  });

  it('FREE user sees only null-tier modules without grants', async () => {
    mockModuleFindMany.mockResolvedValue([SLIDESHOW, TALKING_HEAD, N8N_EXPLAINER]);
    mockUserModuleAccessFindMany.mockResolvedValue([]);
    const list = await listAccessibleModules(FREE_USER);
    expect(list.map((m) => m.slug)).toEqual(['slideshow']);
  });

  it('grant unlocks a gated module for FREE user', async () => {
    mockModuleFindMany.mockResolvedValue([SLIDESHOW, TALKING_HEAD, N8N_EXPLAINER]);
    mockUserModuleAccessFindMany.mockResolvedValue([{ moduleId: N8N_EXPLAINER.id }]);
    const list = await listAccessibleModules(FREE_USER);
    expect(list.map((m) => m.slug).sort()).toEqual(['n8n-explainer', 'slideshow']);
  });

  it('PRO user sees PRO-gated modules, not AGENCY', async () => {
    mockModuleFindMany.mockResolvedValue([SLIDESHOW, TALKING_HEAD, N8N_EXPLAINER]);
    mockUserModuleAccessFindMany.mockResolvedValue([]);
    const list = await listAccessibleModules(PRO_USER);
    expect(list.map((m) => m.slug).sort()).toEqual(['slideshow', 'talking-head']);
  });
});

describe('grantModuleAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when module slug does not exist', async () => {
    mockModuleFindUnique.mockResolvedValue(null);
    await expect(grantModuleAccess({ userId: 'u1', moduleSlug: 'ghost' })).rejects.toThrow(
      'Module not found: ghost'
    );
  });

  it('upserts with default source when not provided', async () => {
    mockModuleFindUnique.mockResolvedValue({ id: 'm1' });
    mockUserModuleAccessUpsert.mockResolvedValue({});
    await grantModuleAccess({ userId: 'u1', moduleSlug: 'slideshow' });
    expect(mockUserModuleAccessUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ source: 'manual', expiresAt: null }),
      })
    );
  });

  it('records source and expiresAt when provided', async () => {
    mockModuleFindUnique.mockResolvedValue({ id: 'm1' });
    mockUserModuleAccessUpsert.mockResolvedValue({});
    const expiresAt = new Date('2030-01-01');
    await grantModuleAccess({
      userId: 'u1',
      moduleSlug: 'slideshow',
      source: 'purchase',
      expiresAt,
    });
    expect(mockUserModuleAccessUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ source: 'purchase', expiresAt }),
      })
    );
  });
});
