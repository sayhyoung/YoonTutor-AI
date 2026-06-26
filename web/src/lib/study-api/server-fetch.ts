// 쿠키의 accessToken으로 study-api를 호출하고, 401이면 refresh 후 1회 재시도한다.
// (문서: 401 A-1207 만료 → refresh → 원요청 1회 재시도)

import { studyRefresh } from "./auth";
import { StudyApiError, studyFetch } from "./client";
import { getAccessToken, getRefreshToken, setTokens } from "./token-store";

export async function authedStudyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  if (!token) {
    throw new StudyApiError(401, "로그인이 필요해.", "A-1000");
  }

  try {
    return await studyFetch<T>(path, { accessToken: token });
  } catch (error) {
    if (error instanceof StudyApiError && error.status === 401) {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw error;
      // refresh 성공 시 새 토큰 저장(rotation) 후 원요청 1회 재시도.
      const tokens = await studyRefresh(refreshToken);
      await setTokens(tokens);
      return await studyFetch<T>(path, { accessToken: tokens.accessToken });
    }
    throw error;
  }
}
