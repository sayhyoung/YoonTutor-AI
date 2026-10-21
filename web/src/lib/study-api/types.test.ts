import { describe, expect, it } from "vitest";

import { extractProfile, learningSourcesForBms } from "./types";

const tokens = {
  accessToken: "<ACCESS_TOKEN>",
  refreshToken: "<REFRESH_TOKEN>",
  accessTokenExpiresAt: "",
  refreshTokenExpiresAt: "",
  accessTokenExpiresIn: 60,
  refreshTokenExpiresIn: 600,
};

describe("extractProfile", () => {
  it("reads the memberships array from member and teacher logins", () => {
    const profile = extractProfile({
      ...tokens,
      teacherNo: 10001,
      teacherName: "교사",
      memberships: [
        { agencyNo: 1910, agencyName: "숲센터", bmName: "FOREST" },
        { agencyNo: 1999, agencyName: "교실센터", bmName: "HOME" },
      ],
    });

    expect(profile.teacherNo).toBe("10001");
    expect(profile.memberships).toEqual([
      { agencyNo: "1910", agencyName: "숲센터", bmName: "FOREST" },
      { agencyNo: "1999", agencyName: "교실센터", bmName: "HOME" },
    ]);
    expect(profile.agencyNo).toBe("1910");
  });

  it("keeps the flat center login fields as a single membership", () => {
    const profile = extractProfile({ ...tokens, agencyNo: 1999, agencyName: "교실센터", bmName: "HOME" });

    expect(profile.memberships).toEqual([{ agencyNo: "1999", agencyName: "교실센터", bmName: "HOME" }]);
  });

  it("treats a null bmName as unknown", () => {
    const profile = extractProfile({ ...tokens, memberships: [{ agencyNo: 1, bmName: null }] });

    expect(profile.memberships[0].bmName).toBeUndefined();
  });
});

describe("learningSourcesForBms", () => {
  it("picks the learning API by BM", () => {
    expect(learningSourcesForBms(["HOME"])).toEqual({ smartBefly: true, academy: false });
    expect(learningSourcesForBms(["WELL"])).toEqual({ smartBefly: true, academy: false });
    expect(learningSourcesForBms(["forest"])).toEqual({ smartBefly: false, academy: true });
    expect(learningSourcesForBms(["IGSE", "HOME"])).toEqual({ smartBefly: true, academy: true });
    expect(learningSourcesForBms([])).toEqual({ smartBefly: true, academy: true });
    expect(learningSourcesForBms([null, undefined])).toEqual({ smartBefly: true, academy: true });
  });
});
