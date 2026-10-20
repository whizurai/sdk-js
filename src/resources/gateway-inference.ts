/**
 * Synchronous inference through the api-gateway — `POST /v1/generate/text`
 * and `POST /v1/images/describe`.
 *
 * Unlike `chat()`/`embed()` (model-router, `inferenceBaseUrl`), these use the
 * gateway at `baseUrl`. The gateway takes the app from the API key, applies AI
 * rate limits and leases the work on the fleet under that app's policy, so
 * declare `metadata.priority` on every call.
 *
 * Exposed as `client.generateText()` / `client.describeImage()`. Responses are
 * returned in their wire shape; read the served model from `model`.
 */

import { AxiosInstance } from 'axios';
import { ValidationError } from '../errors';
import {
  DescribeImageRequest,
  DescribeImageResponse,
  GatewayCallOptions,
  GenerateTextRequest,
  GenerateTextResponse,
} from '../types';

function callConfig(options: GatewayCallOptions): { timeout: number } | undefined {
  return options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : undefined;
}

export class GatewayInferenceResource {
  constructor(private readonly http: AxiosInstance) {}

  /** Generate text. `prompt` is required; omitted `model` is `chat` on the fleet, fleet-required. */
  async generateText(params: GenerateTextRequest, options: GatewayCallOptions = {}): Promise<GenerateTextResponse> {
    if (typeof params?.prompt !== 'string' || params.prompt.trim() === '') {
      throw new ValidationError('generateText() requires a non-empty `prompt`.', 'PROMPT_REQUIRED');
    }
    const res = await this.http.post('/v1/generate/text', params, callConfig(options));
    return res.data as GenerateTextResponse;
  }

  /** Describe an image. Exactly one of `image` (base64) or `imageUrl`. */
  async describeImage(params: DescribeImageRequest, options: GatewayCallOptions = {}): Promise<DescribeImageResponse> {
    const hasImage = typeof params?.image === 'string' && params.image !== '';
    const hasUrl = typeof params?.imageUrl === 'string' && params.imageUrl !== '';
    if (hasImage === hasUrl) {
      throw new ValidationError(
        'describeImage() requires exactly one of `image` (base64) or `imageUrl`.',
        'IMAGE_REQUIRED'
      );
    }
    const res = await this.http.post('/v1/images/describe', params, callConfig(options));
    return res.data as DescribeImageResponse;
  }
}
