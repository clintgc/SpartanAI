import axios, { AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { CaptisClient } from '../../shared/services/captis-client';

jest.mock('axios');
jest.mock('axios-retry');

describe('CaptisClient', () => {
  const mockAxiosCreate = axios.create as jest.Mock;
  const mockAxiosGet = jest.fn();
  const mockAxiosPost = jest.fn();
  const mockInstance: any = {
    post: mockAxiosPost,
    get: mockAxiosGet,
    defaults: { baseURL: 'https://api.test' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosCreate.mockReturnValue(mockInstance);
    (axios.get as jest.Mock).mockImplementation(mockAxiosGet);
    (axios.isAxiosError as unknown as jest.Mock).mockReturnValue(true);
  });

  it('resolve() posts image with defaults and handles URL fetch', async () => {
    // Mock image fetch for URL input
    mockAxiosGet.mockResolvedValue({
      data: Buffer.from('img'),
      headers: { 'content-type': 'image/png' },
    });
    const resolveResponse = { id: 'scan-1', status: 'PENDING' };
    mockAxiosPost.mockResolvedValue({ data: resolveResponse });

    const client = new CaptisClient({ baseUrl: 'https://api.test', accessKey: 'key' });
    const result = await client.resolve({
      image: 'https://example.com/img.png',
      async: true,
      minScore: 50,
      fields: ['matches', 'biometrics'],
      minFaceSize: 50,
    });

    expect(result).toEqual(resolveResponse);
    expect(mockAxiosGet).toHaveBeenCalledWith('https://example.com/img.png', { responseType: 'arraybuffer' });
    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/pub/asi/v4/resolve'),
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'image/png' }),
        maxRedirects: 5,
      })
    );
    const url = (mockAxiosPost.mock.calls[0][0] as string);
    expect(url).toContain('minScore=50');
    expect(url).toContain('fields=matches%2Cbiometrics');
    expect(url).toContain('minFaceSize=50');
  });

  it('resolve() follows 307 redirect up to limit', async () => {
    // First call throws 307 with Location, second succeeds
    const redirectError = Object.assign(new Error('redirect'), {
      response: { status: 307, headers: { location: 'https://new-api.test/pub' } },
      isAxiosError: true,
      toJSON: () => ({}),
    }) as unknown as AxiosError;
    mockAxiosPost
      .mockRejectedValueOnce(redirectError)
      .mockResolvedValueOnce({ data: { id: 'scan-redirect', status: 'PENDING' } });

    const client = new CaptisClient({ baseUrl: 'https://api.test', accessKey: 'key' });
    const result = await client.resolve({ image: Buffer.from('123') });

    expect(result.id).toBe('scan-redirect');
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);
    expect(mockInstance.defaults.baseURL).toBe('https://new-api.test');
  });

  it('resolve() maps 503 to friendly message', async () => {
    mockAxiosPost.mockReset();
    const err = Object.assign(new Error('503'), {
      response: { status: 503, data: {} },
      isAxiosError: true,
      toJSON: () => ({}),
    }) as unknown as AxiosError;
    mockAxiosPost.mockRejectedValue(err);

    const client = new CaptisClient({ baseUrl: 'https://api.test', accessKey: 'key' });
    await expect(client.resolve({ image: Buffer.from('x') })).rejects.toThrow(
      'Captis service temporarily unavailable (503). Retry recommended.'
    );
  });

  it('pollUntilComplete stops when completed and backs off on pending', async () => {
    const client = new CaptisClient({ baseUrl: 'https://api.test', accessKey: 'key' });
    // Stub pollScan and sleep
    const pollSpy = jest.spyOn(client as any, 'pollScan')
      .mockResolvedValueOnce({ status: 'PENDING', timedOutFlag: true } as any)
      .mockResolvedValueOnce({ status: 'COMPLETED', id: 'done' } as any);
    const sleepSpy = jest.spyOn(client as any, 'sleep').mockResolvedValue(undefined);

    const result = await client.pollUntilComplete('scan-123', 10000, 1);

    expect(result.status).toBe('COMPLETED');
    expect(pollSpy).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalled();
  });
});

