// 쿠키의 accessToken으로 study-api를 호출하고, 401이면 refresh 후 1회 재시도한다.
// (문서: 401 A-1207 만료 → refresh → 원요청 1회 재시도)

import { studyRefresh } from "./auth";
import { StudyApiError, studyFetch } from "./client";
import { getAccessToken, getRefreshToken, setTokens } from "./token-store";

// refresh 성공 시 새 토큰 저장(rotation) 후 새 accessToken을 돌려준다.
async function refreshAccessToken(original: StudyApiError): Promise<string> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) throw original;
  const tokens = await studyRefresh(refreshToken);
  await setTokens(tokens);
  return tokens.accessToken;
}

export async function authedStudyFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  // accessToken 쿠키는 만료 시각(maxAge)에 브라우저가 지운다. 그때도 refresh 쿠키가 남아 있으면 재발급한다.
  if (!token) {
    const accessToken = await refreshAccessToken(new StudyApiError(401, "로그인이 필요해.", "A-1000"));
    return await studyFetch<T>(path, { accessToken });
  }

  try {
    return await studyFetch<T>(path, { accessToken: token });
  } catch (error) {
    if (error instanceof StudyApiError && error.status === 401) {
      const accessToken = await refreshAccessToken(error);
      return await studyFetch<T>(path, { accessToken });
    }
    throw error;
  }
}
