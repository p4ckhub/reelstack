import { describe, it, expect } from 'vitest';
import { apiError, apiSuccess } from '../api/errors';

describe('apiError', () => {
  it('returns JSON response with error message and status', async () => {
    const response = apiError(400, 'Bad request');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({ error: 'Bad request' });
  });

  it('returns 401 for unauthorized', async () => {
    const response = apiError(401, 'Unauthorized');
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 404 for not found', async () => {
    const response = apiError(404, 'Not found');
    expect(response.status).toBe(404);
  });

  it('returns 500 for server error', async () => {
    const response = apiError(500, 'Internal error');
    expect(response.status).toBe(500);
  });
});

describe('apiSuccess', () => {
  it('returns JSON response with data and default 200 status', async () => {
    const response = apiSuccess({ foo: 'bar' });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ foo: 'bar' });
  });

  it('supports custom status code', async () => {
    const response = apiSuccess({ created: true }, 201);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ created: true });
  });

  it('returns null data', async () => {
    const response = apiSuccess(null);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toBeNull();
  });

  it('returns array data', async () => {
    const response = apiSuccess([1, 2, 3]);
    const body = await response.json();
    expect(body).toEqual([1, 2, 3]);
  });
});
