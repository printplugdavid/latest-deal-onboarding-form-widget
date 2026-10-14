import { FOLDER_FUNCTION, folderArguments, readFolderAnswer, requestDealFolders, shouldRequestFolders } from "./dealFolders";

// E-56 -- the form asks the CRM function to create the Deal's WorkDrive folders (docs/38).
const OK = { dry_run: false, status: "ok", message: "", found: [], created: ["kiki test", "Deal 2- TEST", "Mock Up", "Art Assets", "Rejected", "Embroidery"], would_create: [], deal_folder_link: "https://workdrive.zoho.com/folder/wk20z7", mock_up_link: "https://workdrive.zohoexternal.com/external/be1f" };
const wrap = (o) => ({ code: "success", details: { output: JSON.stringify(o) } });

describe("E-56 which deals are sent -- no back-fill of hand-made folders", () => {
  test("no folder yet: yes. Made by the automation: yes. A hand-made folder (only the Mock Up link): no", () => {
    expect(shouldRequestFolders({ id: "1" })).toBe(true);
    expect(shouldRequestFolders({ WorkDrive_Link: null, Deal_Folder_Link: "  " })).toBe(true);
    expect(shouldRequestFolders({ Deal_Folder_Link: "https://workdrive.zoho.com/folder/abc", WorkDrive_Link: "https://workdrive.zohoexternal.com/external/x" })).toBe(true);
    expect(shouldRequestFolders({ Deal_Folder_Link: "https://workdrive.zoho.com/folder/abc" })).toBe(true);
    expect(shouldRequestFolders({ WorkDrive_Link: "https://workdrive.zohoexternal.com/folder/pn7wib" })).toBe(false);
    expect(shouldRequestFolders({ WorkDrive_Link: "pasted text", Deal_Folder_Link: null })).toBe(false);
    expect(shouldRequestFolders(null)).toBe(false);
    expect(shouldRequestFolders(undefined)).toBe(false);
  });
});

describe("E-56 what is sent", () => {
  test("the function's name, the deal id as a string, and dry_run as the exact STRING \"false\"", () => {
    expect(FOLDER_FUNCTION).toBe("widget_create_deal_folders");
    const sent = JSON.parse(folderArguments(5249739000087561441n).arguments);
    expect(sent).toEqual({ deal_id: "5249739000087561441", dry_run: "false" });
    expect(typeof sent.dry_run).toBe("string"); // a boolean false would be treated as a dry run
    expect(JSON.parse(folderArguments("123").arguments).deal_id).toBe("123");
  });
});

describe("E-56 what comes back", () => {
  test("a real run", () => {
    expect(readFolderAnswer(wrap(OK))).toEqual({ status: "ok", message: "", created: OK.created, found: [], dealFolderLink: "https://workdrive.zoho.com/folder/wk20z7" });
  });
  test("'skipped' (an online-store order) is a success with nothing created; an empty link is not a failure", () => {
    expect(readFolderAnswer(wrap({ dry_run: false, status: "skipped", message: "Online-store order - folders are not created for these", found: [], created: [], deal_folder_link: "", mock_up_link: "" }))).toEqual({ status: "skipped", message: "Online-store order - folders are not created for these", created: [], found: [], dealFolderLink: "" });
    expect(readFolderAnswer(wrap({ ...OK, mock_up_link: "" })).status).toBe("ok"); // the Deal already had its Mock Up link
  });
  test("an error from the function keeps its message", () => {
    expect(readFolderAnswer(wrap({ status: "error", message: "WorkDrive: could not create Art Assets", created: ["Mock Up"] }))).toMatchObject({ status: "error", message: "WorkDrive: could not create Art Assets", created: ["Mock Up"], dealFolderLink: "" });
  });
  test("a dry run is never reported as done; a link that is not https is not kept", () => {
    expect(readFolderAnswer(wrap({ ...OK, dry_run: true, created: [] }))).toMatchObject({ status: "unavailable" });
    expect(readFolderAnswer(wrap({ ...OK, deal_folder_link: "javascript:alert(1)" })).dealFolderLink).toBe("");
  });
  test("no answer, a refusal, or something that is not JSON is 'unavailable' -- never a throw", () => {
    [null, undefined, {}, { code: "INVALID_DATA" }, { details: {} }, { details: { output: "<html>" } }, { details: { output: "null" } }, { details: { output: JSON.stringify({ status: "weird" }) } }].forEach((r) =>
      expect(readFolderAnswer(r).status).toBe("unavailable")
    );
    expect(readFolderAnswer({ details: { output: OK } }).status).toBe("ok"); // already an object
  });
});

describe("E-56 firing the request", () => {
  const realZoho = window.ZOHO;
  const quiet = jest.spyOn(console, "log").mockImplementation(() => {});
  afterEach(() => {
    window.ZOHO = realZoho;
  });
  afterAll(() => quiet.mockRestore());

  test("calls the function once with the right arguments and resolves to its answer", async () => {
    const execute = jest.fn(async () => wrap(OK));
    window.ZOHO = { CRM: { FUNCTIONS: { execute } } };
    const answer = await requestDealFolders("5249739000087561441");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith("widget_create_deal_folders", { arguments: '{"deal_id":"5249739000087561441","dry_run":"false"}' });
    expect(answer.status).toBe("ok");
  });
  test("returns at once -- it does not wait for a 13-second run", async () => {
    let finish;
    let settled = false;
    window.ZOHO = { CRM: { FUNCTIONS: { execute: () => new Promise((r) => (finish = r)) } } };
    const p = requestDealFolders("1");
    p.then(() => (settled = true));
    expect(p).toBeInstanceOf(Promise); // handed back straight away
    await new Promise((r) => setTimeout(r, 20));
    expect(typeof finish).toBe("function"); // the function has been called ...
    expect(settled).toBe(false); // ... and is still "running"; the caller was never held up
    finish(wrap(OK));
    await expect(p).resolves.toMatchObject({ status: "ok" });
  });
  test("a refusal, a throw, a missing function or a missing id never rejects and never throws", async () => {
    window.ZOHO = { CRM: { FUNCTIONS: { execute: async () => { throw new Error("REST API is off"); } } } };
    await expect(requestDealFolders("1")).resolves.toMatchObject({ status: "unavailable", message: "call failed: REST API is off" });
    window.ZOHO = { CRM: { FUNCTIONS: { execute: () => { throw new Error("sync boom"); } } } };
    await expect(requestDealFolders("1")).resolves.toMatchObject({ status: "unavailable" });
    window.ZOHO = { CRM: {} };
    await expect(requestDealFolders("1")).resolves.toMatchObject({ status: "unavailable" });
    window.ZOHO = undefined;
    await expect(requestDealFolders("1")).resolves.toMatchObject({ status: "unavailable" });
    const execute = jest.fn();
    window.ZOHO = { CRM: { FUNCTIONS: { execute } } };
    await expect(requestDealFolders("")).resolves.toMatchObject({ status: "unavailable" });
    expect(execute).not.toHaveBeenCalled();
  });
});
