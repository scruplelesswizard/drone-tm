import { afterEach, describe, expect, it } from 'vitest';
import { buildDownloadUrl } from './index';

describe('buildDownloadUrl', () => {
  afterEach(() => {
    localStorage.removeItem('token');
  });

  it('returns presigned S3 URLs unchanged', () => {
    const url = 'https://s3.example.com/bucket/key?X-Amz-Signature=abc';
    expect(buildDownloadUrl(url)).toBe(url);
  });

  it('prepends the versioned API base without doubling the prefix', () => {
    // Backend responses already bake the configured API_PREFIX (/api/v1)
    // into assets_url - the base must not be prepended a second time.
    expect(buildDownloadUrl('/api/v1/projects/odm/export/1/')).toBe(
      '/api/v1/projects/odm/export/1/',
    );
  });

  it('strips a legacy unversioned /api/ prefix instead of doubling it', () => {
    expect(buildDownloadUrl('/api/projects/odm/export/1/')).toBe(
      '/api/v1/projects/odm/export/1/',
    );
  });

  it('prepends the API base to a bare relative path', () => {
    expect(buildDownloadUrl('projects/1/odm/orthophoto.tif')).toBe(
      '/api/v1/projects/1/odm/orthophoto.tif',
    );
  });

  it('appends the auth token as a query param when present', () => {
    localStorage.setItem('token', 'tok123');
    expect(buildDownloadUrl('/api/v1/projects/odm/export/1/')).toBe(
      '/api/v1/projects/odm/export/1/?token=tok123',
    );
  });
});
