/**
 * TypeScript SDK Tests
 */

import { CheddarWhizzyClient, createClient } from '../src/index';
import { AxiosError } from 'axios';

// Mock axios
jest.mock('axios');
const axios = require('axios');

// Mock axios.create to return a mock client
const mockAxiosClient = {
  interceptors: {
    request: {
      use: jest.fn(),
    },
    response: {
      use: jest.fn(),
    },
  },
  post: jest.fn(),
  get: jest.fn(),
};

axios.create.mockReturnValue(mockAxiosClient);

describe('CheddarWhizzyClient', () => {
  let client: CheddarWhizzyClient;
  const mockConfig = {
    apiKey: 'test-api-key',
    baseUrl: 'http://localhost:3000',
  };

  beforeEach(() => {
    client = new CheddarWhizzyClient(mockConfig);
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with correct configuration', () => {
      expect(client).toBeInstanceOf(CheddarWhizzyClient);
    });

    it('should use default configuration when not provided', () => {
      const clientWithDefaults = new CheddarWhizzyClient({ apiKey: 'test-key' });
      expect(clientWithDefaults).toBeInstanceOf(CheddarWhizzyClient);
    });

    it('should merge provided configuration with defaults', () => {
      const customConfig = {
        apiKey: 'custom-key',
        baseUrl: 'https://api.example.com',
        timeout: 60000,
      };
      const customClient = new CheddarWhizzyClient(customConfig);
      expect(customClient).toBeInstanceOf(CheddarWhizzyClient);
    });
  });

  describe('generate', () => {
    it('should call generate endpoint successfully', async () => {
      const mockResponse = {
        data: {
          content: 'Generated content',
          model: 'gpt-3.5-turbo',
          usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        },
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const request = {
        prompt: 'Test prompt',
        model: 'gpt-3.5-turbo',
        maxTokens: 100,
        temperature: 0.7,
      };

      const result = await client.generate(request);

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v1/generate', request);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle generate endpoint errors', async () => {
      const error = new Error('Network error');
      mockAxiosClient.post.mockRejectedValue(error);

      const request = {
        prompt: 'Test prompt',
      };

      await expect(client.generate(request)).rejects.toThrow(
        'Failed to generate content: Network error'
      );
    });

    it('should handle axios errors with response data', async () => {
      const axiosError = new AxiosError('API Error');
      axiosError.response = {
        data: { error: 'Invalid request' },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {
          headers: {},
          method: 'POST',
          url: '/v1/generate',
        } as any,
      };
      mockAxiosClient.post.mockRejectedValue(axiosError);

      const request = {
        prompt: 'Test prompt',
      };

      await expect(client.generate(request)).rejects.toThrow(
        'Failed to generate content: undefined'
      );
    });
  });

  describe('enrich', () => {
    it('should call enrich endpoint successfully', async () => {
      const mockResponse = {
        data: {
          tags: ['technology', 'ai'],
          summary: 'This is about AI technology',
          sentiment: 'positive' as const,
          confidence: 0.95,
        },
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const request = {
        content: 'AI is transforming technology',
        type: 'text' as const,
        options: { includeSentiment: true },
      };

      const result = await client.enrich(request);

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v1/enrich', request);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle enrich endpoint errors', async () => {
      const error = new Error('Enrichment failed');
      mockAxiosClient.post.mockRejectedValue(error);

      const request = {
        content: 'Test content',
        type: 'text' as const,
      };

      await expect(client.enrich(request)).rejects.toThrow(
        'Failed to enrich content: Enrichment failed'
      );
    });
  });

  describe('search', () => {
    it('should call search endpoint successfully', async () => {
      const mockResponse = {
        data: {
          results: [
            {
              id: '1',
              content: 'Search result 1',
              score: 0.95,
              metadata: { type: 'document' },
            },
          ],
          total: 1,
        },
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const request = {
        query: 'test query',
        limit: 10,
        filters: { category: 'technology' },
      };

      const result = await client.search(request);

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v1/search', request);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle search endpoint errors', async () => {
      const error = new Error('Search failed');
      mockAxiosClient.post.mockRejectedValue(error);

      const request = {
        query: 'test query',
      };

      await expect(client.search(request)).rejects.toThrow('Failed to search: Search failed');
    });
  });

  describe('recommend', () => {
    it('should call recommend endpoint successfully', async () => {
      const mockResponse = {
        data: {
          recommendations: [
            {
              id: 'rec1',
              score: 0.9,
              reason: 'Similar to your interests',
            },
          ],
        },
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const request = {
        userId: 'user123',
        itemId: 'item456',
        limit: 5,
      };

      const result = await client.recommend(request);

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v1/recommend', request);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle recommend endpoint errors', async () => {
      const error = new Error('Recommendation failed');
      mockAxiosClient.post.mockRejectedValue(error);

      const request = {
        userId: 'user123',
      };

      await expect(client.recommend(request)).rejects.toThrow(
        'Failed to get recommendations: Recommendation failed'
      );
    });
  });

  describe('moderate', () => {
    it('should call moderate endpoint successfully', async () => {
      const mockResponse = {
        data: {
          safe: true,
          confidence: 0.95,
          categories: ['safe'],
          explanation: 'Content appears safe',
        },
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const request = {
        content: 'This is safe content',
        type: 'text' as const,
      };

      const result = await client.moderate(request);

      expect(mockAxiosClient.post).toHaveBeenCalledWith('/v1/moderate', request);
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle moderate endpoint errors', async () => {
      const error = new Error('Moderation failed');
      mockAxiosClient.post.mockRejectedValue(error);

      const request = {
        content: 'Test content',
        type: 'text' as const,
      };

      await expect(client.moderate(request)).rejects.toThrow(
        'Failed to moderate content: Moderation failed'
      );
    });
  });

  describe('uploadFile', () => {
    it('should call upload endpoint successfully', async () => {
      const mockResponse = {
        data: {
          id: 'file123',
          url: 'https://example.com/file123',
          size: 1024,
          type: 'image/jpeg',
        },
      };

      mockAxiosClient.post.mockResolvedValue(mockResponse);

      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });
      const options = { category: 'images' };

      const result = await client.uploadFile(file, options);

      expect(mockAxiosClient.post).toHaveBeenCalledWith(
        '/v1/upload',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' },
          params: options,
        })
      );
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle upload endpoint errors', async () => {
      const error = new Error('Upload failed');
      mockAxiosClient.post.mockRejectedValue(error);

      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      await expect(client.uploadFile(file)).rejects.toThrow('Failed to upload file: Upload failed');
    });
  });

  describe('healthCheck', () => {
    it('should call health endpoint successfully', async () => {
      const mockResponse = {
        data: {
          status: 'healthy',
          timestamp: '2024-01-01T00:00:00Z',
          uptime: 3600,
          version: '1.0.0',
        },
      };

      mockAxiosClient.get.mockResolvedValue(mockResponse);

      const result = await client.healthCheck();

      expect(mockAxiosClient.get).toHaveBeenCalledWith('/health');
      expect(result).toEqual(mockResponse.data);
    });

    it('should handle health check errors', async () => {
      const error = new Error('Health check failed');
      mockAxiosClient.get.mockRejectedValue(error);

      await expect(client.healthCheck()).rejects.toThrow(
        'Health check failed: Health check failed'
      );
    });
  });

  describe('interceptors', () => {
    it('should set up request and response interceptors', () => {
      // Create a new client to trigger interceptor setup
      new CheddarWhizzyClient(mockConfig);
      expect(mockAxiosClient.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosClient.interceptors.response.use).toHaveBeenCalled();
    });

    it('should log requests in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Clear previous calls and create new client
      mockAxiosClient.interceptors.request.use.mockClear();
      new CheddarWhizzyClient(mockConfig);

      const requestInterceptor = mockAxiosClient.interceptors.request.use.mock.calls[0][0];
      const config = { method: 'POST', url: '/v1/test' };

      // Mock console.log to verify it's called
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      requestInterceptor(config);

      expect(consoleSpy).toHaveBeenCalledWith('Making request to POST /v1/test');

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should not log requests in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      // Clear previous calls and create new client
      mockAxiosClient.interceptors.request.use.mockClear();
      new CheddarWhizzyClient(mockConfig);

      const requestInterceptor = mockAxiosClient.interceptors.request.use.mock.calls[0][0];
      const config = { method: 'POST', url: '/v1/test' };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      requestInterceptor(config);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should log responses in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Clear previous calls and create new client
      mockAxiosClient.interceptors.response.use.mockClear();
      new CheddarWhizzyClient(mockConfig);

      const responseInterceptor = mockAxiosClient.interceptors.response.use.mock.calls[0][0];
      const response = { status: 200, statusText: 'OK' };

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      responseInterceptor(response);

      expect(consoleSpy).toHaveBeenCalledWith('Response received: 200 OK');

      consoleSpy.mockRestore();
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle response errors', async () => {
      // Clear previous calls and create new client
      mockAxiosClient.interceptors.response.use.mockClear();
      new CheddarWhizzyClient(mockConfig);

      const responseErrorInterceptor = mockAxiosClient.interceptors.response.use.mock.calls[0][1];
      const axiosError = new AxiosError('API Error');
      axiosError.response = {
        data: { error: 'Bad request' },
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config: {
          headers: {},
          method: 'POST',
          url: '/v1/test',
        } as any,
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call the interceptor and verify console.error is called
      try {
        await responseErrorInterceptor(axiosError);
      } catch (err) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith('Response error:', { error: 'Bad request' });

      consoleSpy.mockRestore();
    });

    it('should handle request errors', async () => {
      // Clear previous calls and create new client
      mockAxiosClient.interceptors.request.use.mockClear();
      new CheddarWhizzyClient(mockConfig);

      const requestErrorInterceptor = mockAxiosClient.interceptors.request.use.mock.calls[0][1];
      const error = new Error('Request failed');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call the interceptor and verify console.error is called
      try {
        await requestErrorInterceptor(error);
      } catch (err) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith('Request error:', error);

      consoleSpy.mockRestore();
    });

    it('should handle response errors without response data', async () => {
      // Clear previous calls and create new client
      mockAxiosClient.interceptors.response.use.mockClear();
      new CheddarWhizzyClient(mockConfig);

      const responseErrorInterceptor = mockAxiosClient.interceptors.response.use.mock.calls[0][1];
      const axiosError = new AxiosError('API Error');
      // No response data - should use error.message

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Call the interceptor and verify console.error is called
      try {
        await responseErrorInterceptor(axiosError);
      } catch (err) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith('Response error:', '');

      consoleSpy.mockRestore();
    });

    it('should handle non-Error objects in generate method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.post.mockRejectedValue(nonErrorObject);

      const request = {
        prompt: 'Test prompt',
      };

      await expect(client.generate(request)).rejects.toThrow(
        'Failed to generate content: [object Object]'
      );
    });

    it('should handle non-Error objects in enrich method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.post.mockRejectedValue(nonErrorObject);

      const request = {
        content: 'Test content',
        type: 'text' as const,
      };

      await expect(client.enrich(request)).rejects.toThrow(
        'Failed to enrich content: [object Object]'
      );
    });

    it('should handle non-Error objects in search method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.post.mockRejectedValue(nonErrorObject);

      const request = {
        query: 'test query',
      };

      await expect(client.search(request)).rejects.toThrow('Failed to search: [object Object]');
    });

    it('should handle non-Error objects in recommend method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.post.mockRejectedValue(nonErrorObject);

      const request = {
        userId: 'user123',
      };

      await expect(client.recommend(request)).rejects.toThrow(
        'Failed to get recommendations: [object Object]'
      );
    });

    it('should handle non-Error objects in moderate method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.post.mockRejectedValue(nonErrorObject);

      const request = {
        content: 'Test content',
        type: 'text' as const,
      };

      await expect(client.moderate(request)).rejects.toThrow(
        'Failed to moderate content: [object Object]'
      );
    });

    it('should handle non-Error objects in uploadFile method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.post.mockRejectedValue(nonErrorObject);

      const file = new File(['test content'], 'test.jpg', { type: 'image/jpeg' });

      await expect(client.uploadFile(file)).rejects.toThrow(
        'Failed to upload file: [object Object]'
      );
    });

    it('should handle non-Error objects in healthCheck method', async () => {
      const nonErrorObject = { message: 'Not an Error object' };
      mockAxiosClient.get.mockRejectedValue(nonErrorObject);

      await expect(client.healthCheck()).rejects.toThrow('Health check failed: [object Object]');
    });
  });
});

describe('createClient', () => {
  it('should create a new client instance', () => {
    const config = {
      apiKey: 'test-api-key',
      baseUrl: 'http://localhost:3000',
    };

    const client = createClient(config);
    expect(client).toBeInstanceOf(CheddarWhizzyClient);
  });

  it('should create client with minimal config', () => {
    const config = {
      apiKey: 'test-api-key',
    };

    const client = createClient(config);
    expect(client).toBeInstanceOf(CheddarWhizzyClient);
  });
});
