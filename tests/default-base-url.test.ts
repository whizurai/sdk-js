import { DEFAULT_BASE_URL } from '../src/http-client';

describe('DEFAULT_BASE_URL', () => {
  // api.whizurai.com never resolved; a client built without baseUrl could not connect.
  it('is the production gateway over https', () => {
    expect(DEFAULT_BASE_URL).toBe('https://api.whizur.ai');
  });
});
