import type {
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
} from '../http';
import type { Router } from '../router';
import type { Maybe } from '../types';

export type HTTPSdk<TRouter extends Router> = {
  query: ReturnType<TRouter['createQueryHandler']>;
  mutate: ReturnType<TRouter['createMutationHandler']>;
};
export class HTTPClientError extends Error {
  public readonly json?: Maybe<HTTPResponseEnvelope<unknown>>;
  public readonly res?: Maybe<Response>;
  public readonly originalError?: Maybe<Error>;

  constructor(
    message: string,
    {
      res,
      json,
      originalError,
    }: {
      res?: Maybe<Response>;
      json?: Maybe<HTTPResponseEnvelope<unknown>>;
      originalError?: Maybe<Error>;
    },
  ) {
    super(message);
    this.message = message;
    this.res = res;
    this.json = json;
    this.originalError = originalError;

    Object.setPrototypeOf(this, HTTPClientError.prototype);
  }
}

export interface CreateHttpClientOptions {
  url: string;
  fetch?: typeof fetch;
  getHeaders?: () => Record<string, string | undefined>;
  onSuccess?: (data: HTTPSuccessResponseEnvelope<unknown>) => void;
  onError?: (error: HTTPClientError) => void;
}
export function createHttpClient<TRouter extends Router>(
  opts: CreateHttpClientOptions,
): HTTPSdk<TRouter> {
  const { fetch: _fetch = fetch, url } = opts;

  async function handleResponse(promise: Promise<Response>) {
    let res: Maybe<Response> = null;
    let json: Maybe<HTTPResponseEnvelope<unknown>> = null;
    try {
      res = await promise;
      json = (await res.json()) as HTTPResponseEnvelope<unknown>;

      if (json.ok === true) {
        opts.onSuccess && opts.onSuccess(json!);
        return json!.data as any;
      }
      throw new HTTPClientError(json.error.message, { json, res });
    } catch (originalError) {
      let err: HTTPClientError = originalError;
      if (!(err instanceof HTTPClientError)) {
        err = new HTTPClientError(originalError.message, {
          originalError,
          res,
          json,
        });
      }
      opts.onError && opts.onError(err);
      throw err;
    }
  }
  function getHeaders() {
    return {
      ...(opts.getHeaders ? opts.getHeaders() : {}),
      'content-type': 'application/json',
    };
  }
  const query = async (path: string, ...args: unknown[]) => {
    let target = `${url}/${path}`;
    if (args?.length) {
      target += `?args=${encodeURIComponent(JSON.stringify(args as any))}`;
    }
    const promise = _fetch(target, {
      headers: getHeaders(),
    });

    return handleResponse(promise);
  };
  const mutate = async (path: string, ...args: unknown[]) => {
    const promise = _fetch(`${url}/${path}`, {
      method: 'post',
      body: JSON.stringify({
        args,
      }),
      headers: getHeaders(),
    });

    return handleResponse(promise);
  };
  return {
    mutate,
    query,
  } as HTTPSdk<TRouter>;
}
