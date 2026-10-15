import { COPY_FUNCTION, GRACE_MS, afterRequestLeaves, copyArguments, readCopyAnswer, requestArtCopy, shouldCopyArt } from "./artCopy";

// E-72 -- the form asks the CRM function to copy the note's files into the Deal's Art Assets (Deluge docs/33).
// The reply below is the first real run's shape (Master Flooring Deal 6, 2026-10-15) plus the skip key.
const OK = { status: "ok", message: "", copied: ["IMG_9534.png", "3927 Yard Sign Final.ai"], skipped_already_there: ["IMG_9535.png"], not_copied: [], art_assets_link: "https://workdrive.zoho.com/folder/abc", seconds: 3 };
const wrap = (o) => ({ code: "success", details: { output: JSON.stringify(o) } });

describe("E-72 which deals are sent", () => {
  test("only when a file reached the note, and only on a Deal the folder automation owns", () => {
    expect(shouldCopyArt({ id: "1" }, 1)).toBe(true); // no folder yet: the function makes it
    expect(shouldCopyArt({ Deal_Folder_Link: "https://workdrive.zoho.com/folder/abc" }, 3)).toBe(true);
    expect(shouldCopyArt({ Deal_Folder_Link: "https://workdrive.zoho.com/folder/abc" }, 0)).toBe(false); // nothing attached
    expect(shouldCopyArt({ WorkDrive_Link: "https://workdrive.zohoexternal.com/folder/pn7wib" }, 2)).toBe(false); // hand-made folder
    expect(shouldCopyArt(null, 2)).toBe(false);
    expect(shouldCopyArt({ id: "1" }, undefined)).toBe(false);
  });
});

describe("E-72 what is sent", () => {
  test("the function's name and both ids as strings", () => {
    expect(COPY_FUNCTION).toBe("widget_copy_onboarding_files");
    expect(JSON.parse(copyArguments(5249739000127142001n, 5249739000127142016n).arguments)).toEqual({ deal_id: "5249739000127142001", note_id: "5249739000127142016" });
  });
});

describe("E-72 what comes back", () => {
  test("ok, partial and error keep their lists and message", () => {
    expect(readCopyAnswer(wrap(OK))).toEqual({ status: "ok", message: "", copied: OK.copied, skipped: ["IMG_9535.png"], notCopied: [] });
    expect(readCopyAnswer(wrap({ status: "partial", message: "time limit", copied: ["a.png"], not_copied: ["big.psd - not started (time)"] }))).toMatchObject({ status: "partial", notCopied: ["big.psd - not started (time)"], skipped: [] });
    expect(readCopyAnswer(wrap({ status: "error", message: "note is not on this Deal" }))).toMatchObject({ status: "error", message: "note is not on this Deal", copied: [] });
  });
  test("no answer, a refusal, or something that is not JSON is 'unavailable' -- never a throw", () => {
    [null, undefined, {}, { details: {} }, { details: { output: "<html>" } }, { details: { output: "null" } }, { details: { output: JSON.stringify({ status: "weird" }) } }].forEach((r) =>
      expect(readCopyAnswer(r).status).toBe("unavailable")
    );
    expect(readCopyAnswer({ details: { output: OK } }).status).toBe("ok"); // already an object
  });
});

describe("E-72 firing the request", () => {
  const realZoho = window.ZOHO;
  const quiet = jest.spyOn(console, "log").mockImplementation(() => {});
  afterEach(() => {
    window.ZOHO = realZoho;
  });
  afterAll(() => quiet.mockRestore());

  test("calls the function once with the right arguments and resolves to its answer", async () => {
    const execute = jest.fn(async () => wrap(OK));
    window.ZOHO = { CRM: { FUNCTIONS: { execute } } };
    const answer = await requestArtCopy("5249739000127142001", "5249739000127142016");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("widget_copy_onboarding_files", { arguments: '{"deal_id":"5249739000127142001","note_id":"5249739000127142016"}' });
    expect(answer.status).toBe("ok");
  });
  test("a refusal, a throw, a missing function or a missing id never rejects and never throws", async () => {
    window.ZOHO = { CRM: { FUNCTIONS: { execute: async () => { throw new Error("REST API is off"); } } } };
    await expect(requestArtCopy("1", "2")).resolves.toMatchObject({ status: "unavailable", message: "call failed: REST API is off" });
    window.ZOHO = { CRM: { FUNCTIONS: { execute: () => { throw new Error("sync boom"); } } } };
    await expect(requestArtCopy("1", "2")).resolves.toMatchObject({ status: "unavailable" });
    window.ZOHO = undefined;
    await expect(requestArtCopy("1", "2")).resolves.toMatchObject({ status: "unavailable" });
    const execute = jest.fn();
    window.ZOHO = { CRM: { FUNCTIONS: { execute } } };
    await expect(requestArtCopy("1", "")).resolves.toMatchObject({ status: "unavailable" });
    await expect(requestArtCopy("", "2")).resolves.toMatchObject({ status: "unavailable" });
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("E-72 the close waits only briefly", () => {
  test("a quick answer lets the form close at once", async () => {
    const t = Date.now();
    await afterRequestLeaves(Promise.resolve({ status: "ok" }), 5000);
    expect(Date.now() - t).toBeLessThan(1000);
  });
  test("a slow run does not hold the form past the grace period; a rejection never escapes", async () => {
    const t = Date.now();
    await afterRequestLeaves(new Promise(() => {}), 50);
    expect(Date.now() - t).toBeGreaterThanOrEqual(45);
    await expect(afterRequestLeaves(Promise.reject(new Error("x")), 50)).resolves.toBeUndefined();
    expect(GRACE_MS).toBe(2000);
  });
});
