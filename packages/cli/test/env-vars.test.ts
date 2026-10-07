import { describe, expect, it } from 'vitest';
import { formatEnvHint } from '../src/env-vars.js';

describe('formatEnvHint', () => {
  it('aquiles lista SSO (com post-logout), Licenças e Checkout', () => {
    const text = formatEnvHint('aquiles').join('\n');
    for (const name of [
      'QUANTHUM_SSO_ISSUER',
      'QUANTHUM_SSO_CLIENT_ID',
      'QUANTHUM_SSO_CLIENT_SECRET',
      'QUANTHUM_SSO_REDIRECT_URI',
      'QUANTHUM_SSO_POST_LOGOUT_REDIRECT_URI',
      'QUANTHUM_LICENSE_SERVER_URL',
      'QUANTHUM_PRODUCT_KEY',
      'QUANTHUM_LICENSE_KEY',
      'QUANTHUM_LICENSE_PUBLIC_KEY',
      'CHECKOUT_BASE_URL',
      'CHECKOUT_CLIENT_TOKEN',
      'CHECKOUT_WEBHOOK_SECRET',
    ]) {
      expect(text).toContain(name);
    }
    expect(text).not.toContain('QUANTHUM_SSO_SESSION_SECRET');
  });

  it('ulisses lista só SSO, incluindo QUANTHUM_SSO_SESSION_SECRET', () => {
    const text = formatEnvHint('ulisses').join('\n');
    expect(text).toContain('QUANTHUM_SSO_SESSION_SECRET');
    expect(text).toContain('QUANTHUM_SSO_ISSUER');
    expect(text).not.toContain('QUANTHUM_LICENSE');
    expect(text).not.toContain('CHECKOUT_');
    expect(text).not.toContain('POST_LOGOUT');
  });

  it('demais arquétipos não listam nada', () => {
    expect(formatEnvHint('teste')).toEqual([]);
    expect(formatEnvHint('telemacus')).toEqual([]);
  });
});
