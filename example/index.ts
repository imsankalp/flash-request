// api.ts
import { ApiService } from "../index";

const api = new ApiService({
  baseURL: "https://jsonplaceholder.typicode.com",
  defaultHeaders: { "Content-Type": "application/json" },
});

// Add request interceptor → inject auth token
api.addRequestInterceptor(async (config) => {
  const token = "fake-jwt-token"; // You could fetch this from storage
  config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

// Add response interceptor → handle 401 globally
api.addResponseInterceptor(async (response) => {
  if (!response.success && response.error?.status === 401) {
    console.warn("Unauthorized! Redirect to login?");
    // Possibly refresh token here
  }
  return response;
});

// Example usage in React Native
(async () => {
  // GET with query params
  const users = await api.get("/users", { queryParams: { limit: 5 } });
  console.log("Users:", users);

  // POST with body + path params
  const newPost = await api.post("/posts", {
    title: "foo",
    body: "bar",
    userId: 1,
  });
  console.log("New Post:", newPost);
})();