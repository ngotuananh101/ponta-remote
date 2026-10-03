import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/app';
import { getDb, closeDb } from '../src/db/client';
import type { Database } from '../src/db/client';
import { users } from '../src/db/schema';
import { eq } from 'drizzle-orm';

process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-at-least-32-characters-long';

describe('Admin REST Routes', () => {
  let db: Database;
  let adminToken: string;
  let adminUser: any;
  let regularToken: string;
  let regularUser: any;

  beforeEach(async () => {
    db = getDb(':memory:');
    const app = createApp();

    // 1. Admin registration (first user)
    const adminRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'superadmin', password: 'Password123!', publicKey: 'pk_admin' }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.token;
    adminUser = adminData.user;

    // 2. Regular user registration
    const regRes = await app.request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user1', password: 'Password123!', publicKey: 'pk_user1' }),
    });
    regularUser = (await regRes.json()).user;

    // Manually approve user1 to get a token for testing regular user access
    await db.update(users).set({ approvalStatus: 'approved' }).where(eq(users.id, regularUser.id));
    const loginRes = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'user1', password: 'Password123!' }),
    });
    regularToken = (await loginRes.json()).token;
  });

  afterEach(() => {
    closeDb();
  });

  it('rejects non-admin access to /api/admin/stats with 403 FORBIDDEN', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('returns system stats to admin', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/stats', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const stats = await res.json();
    expect(stats.users.total).toBe(2);
    expect(stats.users.admins).toBe(1);
    expect(stats.agents.total).toBe(0);
  });

  it('lists users and filters by status', async () => {
    const app = createApp();
    const res = await app.request('/api/admin/users?status=all', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users.length).toBe(2);
  });

  it('approves a user and promotes to admin', async () => {
    const app = createApp();
    const patchRes = await app.request(`/api/admin/users/${regularUser.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'admin' }),
    });
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.user.role).toBe('admin');
  });

  it('prevents demoting the last active admin with 400 LAST_ADMIN_PROTECTED', async () => {
    const app = createApp();
    const res = await app.request(`/api/admin/users/${adminUser.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'user' }),
    });
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.code).toBe('LAST_ADMIN_PROTECTED');
  });

  it('prevents deactivating the current admin account with 400 SELF_DEACTIVATION_BLOCKED', async () => {
    const app = createApp();
    const res = await app.request(`/api/admin/users/${adminUser.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false }),
    });
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.code).toBe('SELF_DEACTIVATION_BLOCKED');
  });
});
