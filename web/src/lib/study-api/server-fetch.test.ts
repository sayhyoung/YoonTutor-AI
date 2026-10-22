import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = { access: null as string | null, refresh: null as string | null };

vi.mock("./token-store", () => ({
  getAccessToken: async () => jar.access,
  getRefreshToken: async () => jar.refresh,
  setTokens: async (tokens: { accessToken: string; refreshToken: string }) => {
    jar.access = tokens.accessToken;
    jar.refresh = tokens.refreshToken;
  },
}));

const studyRefresh = vi.fn(async () => ({ accessToken: "new-at", refreshToken: "new-rt" }));
vi.mock("./auth", () => ({ studyRefresh: () => studyRefresh() }));

const studyFetch = vi.fn(async (_path: string, init: { accessToken?: string }) => ({ usedToken: init.accessToken }));
vi.mock("./client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./client")>();
  return { ...original, studyFetch: (path: string, init: { accessToken?: string }) => studyFetch(path, init) };
});

const { authedStudyFetch } = await import("./server-fetch");
const { StudyApiError } = await import("./client");

describe("authedStudyFetch", () => {
  beforeEach(() => {
    studyRefresh.mockClear();
    studyFetch.mockClear();
  });

  it("refreshes when the access cookie has already expired but the refresh cookie remains", async () => {
    jar.access = null;
    jar.refresh = "old-rt";
    await expect(authedStudyFetch("/api/teacher/customers")).resolves.toEqual({ usedToken: "new-at" });
    expect(studyRefresh).toHaveBeenCalledTimes(1);
    expect(jar).toEqual({ access: "new-at", refresh: "new-rt" });
  });

  it("asks for login when neither cookie exists", async () => {
    jar.access = null;
    jar.refresh = null;
    await expect(authedStudyFetch("/api/teacher/customers")).rejects.toMatchObject({ status: 401 });
    expect(studyRefresh).not.toHaveBeenCalled();
  });

  it("refreshes once and retries when study-api rejects the access token", async () => {
    jar.access = "expired-at";
    jar.refresh = "old-rt";
    studyFetch.mockImplementationOnce(async () => {
      throw new StudyApiError(401, "expired", "A-1207");
    });
    await expect(authedStudyFetch("/api/teacher/customers")).resolves.toEqual({ usedToken: "new-at" });
    expect(studyRefresh).toHaveBeenCalledTimes(1);
  });
});
