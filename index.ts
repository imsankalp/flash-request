export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiServiceOptions {
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  enableLogging?: boolean;
}

export interface ApiError {
  type: "NETWORK_ERROR" | "TIMEOUT_ERROR" | "VALIDATION_ERROR" | "API_ERROR" | "UNKNOWN_ERROR";
  message: string;
  status?: number;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Interceptor Types
type RequestInterceptor = (config: {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body?: any;
}) => Promise<typeof config> | typeof config;

type ResponseInterceptor<T = any> = (response: ApiResponse<T>) => Promise<ApiResponse<T>> | ApiResponse<T>;

export class ApiService {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private enableLogging: boolean;

  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  constructor(options: ApiServiceOptions = {}) {
    this.baseURL = options.baseURL ?? "";
    this.defaultHeaders = options.defaultHeaders ?? { "Content-Type": "application/json" };
    this.enableLogging = options.enableLogging ?? true;
  }

  private log(message: string, data?: any) {
    if (this.enableLogging) {
      console.log(`[ApiService] ${message}`, data ?? "");
    }
  }

  private buildUrl(endpoint: string, pathParams?: Record<string, string | number>, queryParams?: Record<string, any>): string {
    let url = this.baseURL + endpoint;

    if (pathParams) {
      Object.keys(pathParams).forEach((key) => {
        url = url.replace(`:${key}`, encodeURIComponent(String(pathParams[key])));
      });
    }

    if (queryParams) {
      const query = Object.entries(queryParams)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&");
      if (query) url += `?${query}`;
    }

    return url;
  }

  private validateRequestBody(body: any): boolean {
    if (body === null || body === undefined) return true;
    if (typeof body === "object") return true;
    this.log("Invalid request body", body);
    return false;
  }

  private async runRequestInterceptors(config: {
    url: string;
    method: HttpMethod;
    headers: Record<string, string>;
    body?: any;
  }) {
    let updatedConfig = config;
    for (const interceptor of this.requestInterceptors) {
      updatedConfig = await interceptor(updatedConfig);
    }
    return updatedConfig;
  }

  private async runResponseInterceptors<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> {
    let updatedResponse = response;
    for (const interceptor of this.responseInterceptors) {
      updatedResponse = await interceptor(updatedResponse);
    }
    return updatedResponse;
  }

  private async request<T>(
    method: HttpMethod,
    endpoint: string,
    options: {
      body?: any;
      headers?: Record<string, string>;
      pathParams?: Record<string, string | number>;
      queryParams?: Record<string, any>;
    } = {}
  ): Promise<ApiResponse<T>> {
    try {
      let url = this.buildUrl(endpoint, options.pathParams, options.queryParams);
      let headers = { ...this.defaultHeaders, ...(options.headers ?? {}) };

      if (options.body && !this.validateRequestBody(options.body)) {
        return {
          success: false,
          error: { type: "VALIDATION_ERROR", message: "Invalid request body" },
        };
      }

      let config = { url, method, headers, body: options.body };
      config = await this.runRequestInterceptors(config);

      const fetchOptions: RequestInit = { method: config.method, headers: config.headers };

      if (config.body) {
        try {
          fetchOptions.body = JSON.stringify(config.body);
        } catch (err) {
          return {
            success: false,
            error: { type: "VALIDATION_ERROR", message: "Failed to stringify request body", details: err },
          };
        }
      }

      this.log(`Request → ${config.method} ${config.url}`, { headers: config.headers, body: config.body });

      const response = await fetch(config.url, fetchOptions);

      let responseData: any = null;
      try {
        responseData = await response.json();
      } catch {
        this.log("Response not JSON, returning raw text");
        responseData = await response.text();
      }

      this.log(`Response ← ${config.method} ${config.url}`, { status: response.status, data: responseData });

      let apiResponse: ApiResponse<T>;
      if (!response.ok) {
        apiResponse = {
          success: false,
          error: {
            type: "API_ERROR",
            message: responseData?.message || "Request failed",
            status: response.status,
            details: responseData,
          },
        };
      } else {
        apiResponse = { success: true, data: responseData };
      }

      return await this.runResponseInterceptors(apiResponse);
    } catch (err: any) {
      this.log("Network error", err);
      let errorResponse: ApiResponse = {
        success: false,
        error: {
          type: "NETWORK_ERROR",
          message: err.message ?? "Network error",
          details: err,
        },
      };
      return await this.runResponseInterceptors(errorResponse);
    }
  }

  // Convenience methods
  get<T>(endpoint: string, options?: Omit<Parameters<ApiService["request"]>[2], "body">) {
    return this.request<T>("GET", endpoint, options);
  }

  post<T>(endpoint: string, body?: any, options?: Omit<Parameters<ApiService["request"]>[2], "body">) {
    return this.request<T>("POST", endpoint, { ...options, body });
  }

  put<T>(endpoint: string, body?: any, options?: Omit<Parameters<ApiService["request"]>[2], "body">) {
    return this.request<T>("PUT", endpoint, { ...options, body });
  }

  patch<T>(endpoint: string, body?: any, options?: Omit<Parameters<ApiService["request"]>[2], "body">) {
    return this.request<T>("PATCH", endpoint, { ...options, body });
  }

  delete<T>(endpoint: string, options?: Omit<Parameters<ApiService["request"]>[2], "body">) {
    return this.request<T>("DELETE", endpoint, options);
  }

  // Utilities
  setDefaultHeader(key: string, value: string) {
    this.defaultHeaders[key] = value;
  }

  addRequestInterceptor(interceptor: RequestInterceptor) {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor) {
    this.responseInterceptors.push(interceptor);
  }
}
