// npm i puppeteer puppeteer-core
const puppeteer = require("puppeteer");
const puppeteerCore = require("puppeteer-core");
const fs = require("fs");

// ⬇️ Lấy dữ liệu/đường dẫn/URL từ file riêng
const {
  EMAIL,
  FORM_URL,
  proofPath,
  certificatePath,
  data,
} = require("./form-data");

// Chế độ chạy: full | attach
const MODE = process.env.MODE || "full";

// Utility nhỏ
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ========== Helpers ==========
const cssEscapeId = (id) =>
  id.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");

// chờ container theo cả #id đã escape và [id="..."]
async function waitForContainer(page, rawId) {
  const esc = cssEscapeId(rawId);
  await page.waitForSelector(`#${esc}, [id="${rawId}"]`, {
    visible: true,
    timeout: 60000,
  });
  await page.evaluate((rawId) => {
    const safe =
      window.CSS && CSS.escape
        ? CSS.escape(rawId)
        : rawId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const el =
      document.querySelector(`#${safe}`) ||
      document.querySelector(`[id="${rawId}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }, rawId);
}

async function typeInto(page, containerId, value, isTextarea = false) {
  const esc = cssEscapeId(containerId);

  if (!isTextarea) {
    const selector = `#${esc} input, [id="${containerId}"] input`;
    await page.waitForSelector(selector, { visible: true });
    await page.click(selector, { clickCount: 3 });
    await page.type(selector, value || "");
    return;
  }

  // ---- Textarea path (CONTAINER-ONLY) ----
  await page.waitForSelector(`#${esc}, [id="${containerId}"]`, { timeout: 60000 });

  // scroll vào giữa
  await page.evaluate((rawId) => {
    const safe =
      window.CSS && CSS.escape
        ? CSS.escape(rawId)
        : rawId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const el =
      document.querySelector(`#${safe}`) ||
      document.querySelector(`[id="${rawId}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }, containerId);

  // chỉ tìm bên trong container
  const selectors = [
    `#${esc} textarea`,
    `[id="${containerId}"] textarea`,
    `#${esc} [contenteditable="true"]`,
    `[id="${containerId}"] [contenteditable="true"]`,
  ];

  let handle = null;
  for (const sel of selectors) {
    handle = await page.$(sel);
    if (handle) break;
  }

  if (handle) {
    try {
      await handle.evaluate((node) => node.scrollIntoView({ block: "center" }));
      await handle.click();
      // Ctrl/Cmd + A để xoá hết
      const isMac = await page.evaluate(() => navigator.platform.includes('Mac'));
      if (isMac) {
        await page.keyboard.down("Meta");
      } else {
        await page.keyboard.down("Control");
      }
      await page.keyboard.press("KeyA");
      if (isMac) {
        await page.keyboard.up("Meta");
      } else {
        await page.keyboard.up("Control");
      }

      // gõ giá trị
      if (await handle.evaluate((n) => "value" in n)) {
        await handle.type(value || "");
      } else {
        // contenteditable
        await page.evaluate(
          (el, v) => {
            el.textContent = v || "";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          },
          handle,
          value || ""
        );
      }
      // phát sự kiện an toàn
      await handle.evaluate((el) => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      return;
    } catch { /* rơi xuống DOM-set */ }
  }

  // Fallback DOM-set nhưng CHỈ trong container
  const ok = await page.evaluate(({ rawId, val }) => {
    const safe =
      window.CSS && CSS.escape
        ? CSS.escape(rawId)
        : rawId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const root =
      document.querySelector(`#${safe}`) ||
      document.querySelector(`[id="${rawId}"]`);
    if (!root) return false;
    const ta =
      root.querySelector("textarea") ||
      root.querySelector('[contenteditable="true"]');
    if (!ta) return false;

    if ("value" in ta) {
      ta.value = val || "";
    } else {
      ta.textContent = val || "";
    }
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, { rawId: containerId, val: value });

  if (!ok) throw new Error(`Không nhập được textarea cho "${containerId}"`);
}

async function uploadFile(page, containerId, filePath) {
  const esc = cssEscapeId(containerId);

  // 1) tìm input bên trong container
  let input = await page.$(`#${esc} input[type="file"]`);

  // 2) nếu không thấy, thử theo quy ước id "input-file-<containerId>"
  if (!input) input = await page.$(`#input-file-${containerId}`);

  // 3) nếu vẫn chưa có, click label để framework render input rồi lấy lại
  if (!input) {
    const label =
      (await page.$(`#${esc} label[for]`)) ||
      (await page.$(`#${esc} .choose-file-button`)) ||
      (await page.$(`label[for="input-file-${containerId}"]`));
    if (label) await label.click();
    await new Promise((r) => setTimeout(r, 200));
    input =
      (await page.$(`#${esc} input[type="file"]`)) ||
      (await page.$(`#input-file-${containerId}`));
  }

  if (!input) throw new Error(`Không tìm thấy input file cho "${containerId}"`);
  await input.uploadFile(filePath); // input có thể ẩn, KHÔNG ép visible
}

// chọn radio theo label (dùng cho các nhóm bình thường)
async function clickRadioByLabel(page, containerId, wantedText) {
  const esc = cssEscapeId(containerId);
  await page.waitForSelector(`#${esc}, [id="${containerId}"]`, { visible: true });

  const ok = await page.evaluate(({ containerId, wantedText }) => {
    const root =
      document.querySelector(
        `#${containerId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1")}`
      ) || document.querySelector(`[id="${containerId}"]`);
    if (!root) return false;
    const labels = root.querySelectorAll("label");
    for (const lb of labels) {
      const t = (lb.textContent || "").trim().toLowerCase();
      if (t.includes(wantedText.toLowerCase())) {
        const input =
          lb.querySelector('input[type="radio"]') ||
          lb.closest("div")?.querySelector('input[type="radio"]');
        if (input) {
          input.click();
          input.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }
    return false;
  }, { containerId, wantedText });

  if (!ok) {
    const sel =
      wantedText.toLowerCase() === "yes"
        ? `#${esc} input[type="radio"]:first-of-type`
        : `#${esc} input[type="radio"]:last-of-type`;
    if (await page.$(sel)) await page.click(sel);
  }
}

async function tickAllCheckboxes(page, containerId) {
  const esc = cssEscapeId(containerId);
  const realInputs = await page.$$(`#${esc} input[type="checkbox"]`);
  if (realInputs.length) {
    for (const cb of realInputs) {
      await cb.evaluate((el) => el.scrollIntoView({ block: "center" }));
      try { await cb.click({ offset: { x: 4, y: 4 } }); }
      catch {
        const parent = (await cb.getProperty("parentElement")).asElement();
        if (parent) await parent.click();
      }
    }
    return;
  }
  const wrappers = await page.$$(
    `#${esc} [data-tux-checkbox-input-wrapper="true"], #${esc} label`
  );
  for (const w of wrappers) await w.click();
}

async function clickButtonByText(page, text) {
  const clicked = await page.evaluate((wanted) => {
    const nodes = [
      ...document.querySelectorAll("button"),
      ...document.querySelectorAll('[role="button"]'),
      ...document.querySelectorAll('input[type="submit"], input[type="button"]'),
    ];
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = nodes.find((el) => {
      const t = norm(el.innerText || el.textContent);
      const v = norm(el.value);
      return t === norm(wanted) || v === norm(wanted);
    });
    if (target) { target.click(); return true; }
    return false;
  }, text);
  return clicked;
}

/** Chọn "No" cho “Is this an issue related to counterfeit goods?”  */
async function selectIssueNo(page) {
  const name = "extra.cfGoods";
  await waitForContainer(page, name);

  const radios = await page.$$(`input[type="radio"][name="${name}"]`);
  if (radios.length >= 2) {
    await radios[1].evaluate((el) => el.scrollIntoView({ block: "center" }));
    try {
      await radios[1].click({ offset: { x: 4, y: 4 } });
      const ok = await page.evaluate((el) => el.checked, radios[0]);
      if (ok) return;
    } catch {}
  }

  const byLabel = await page.evaluate((name) => {
    const safe =
      window.CSS && CSS.escape
        ? CSS.escape(name)
        : name.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const root =
      document.querySelector(`#${safe}`) ||
      document.querySelector(`[id="${name}"]`);
    if (!root) return false;
    const labs = Array.from(root.querySelectorAll("label"));
    const lb = labs.find((l) => (l.textContent || "").trim() === "Yes");
    if (lb) { lb.click(); return true; }
    return false;
  }, name);
  if (byLabel) return;

  const byBox = await page.evaluate((name) => {
    const safe =
      window.CSS && CSS.escape
        ? CSS.escape(name)
        : name.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const root =
      document.querySelector(`#${safe}`) ||
      document.querySelector(`[id="${name}"]`);
    const boxes = root?.querySelectorAll("div._TUXRadioStandalone-container");
    if (boxes && boxes[1]) { boxes[1].click(); return true; }
    return false;
  }, name);
  if (byBox) return;

  const forced = await page.evaluate((name) => {
    const ip =
      document.querySelector(`input[type="radio"][name="${name}"][value="0"]`) ||
      document.querySelectorAll(`input[type="radio"][name="${name}"]`)[1];
    if (!ip) return false;
    ip.checked = true;
    ip.dispatchEvent(new Event("input", { bubbles: true }));
    ip.dispatchEvent(new Event("change", { bubbles: true }));
    return ip.checked;
  }, name);
  if (!forced) throw new Error("Không chọn được 'yes' ở Issue type (extra.cFGoods)");
}

/** Điền trường URLs (records) chắc chắn */
async function typeRecords(page, records) {
  const value = (records || []).join("\n");

  // 1) chờ container #link (div bao ngoài)
  await page.waitForSelector('#' + cssEscapeId('link') + ', [id="link"]', { timeout: 60000 });

  // 2) tìm đúng textarea bên trong #link
  let el = await page.$(`#${cssEscapeId('link')} textarea`) ||
           await page.$(`[id="link"] textarea`);
  // TikTok đôi khi dùng contenteditable cho textarea
  if (!el) {
    el = await page.$(`#${cssEscapeId('link')} [contenteditable="true"]`) ||
         await page.$(`[id="link"] [contenteditable="true"]`);
  }
  if (el) {
    await el.evaluate(node => node.scrollIntoView({ block: 'center' }));
    await el.click();
    // Ctrl/Cmd + A rồi gõ
    const isMac = await page.evaluate(() => navigator.platform.includes('Mac'));
    if (isMac) await page.keyboard.down("Meta"); else await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    if (isMac) await page.keyboard.up("Meta"); else await page.keyboard.up("Control");

    if (await el.evaluate(n => 'value' in n)) {
      await el.type(value);
    } else {
      await page.evaluate((node, v) => {
        node.textContent = v;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      }, el, value);
    }
    await el.evaluate(n => {
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return;
  }

  // 3) fallback DOM-set trong #link
  const ok = await page.evaluate((val) => {
    const root = document.querySelector('#link') || document.querySelector('[id="link"]');
    if (!root) return false;
    const ta = root.querySelector('textarea') || root.querySelector('[contenteditable="true"]');
    if (!ta) return false;
    if ('value' in ta) ta.value = val; else ta.textContent = val;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, value);
  if (!ok) throw new Error('Không tìm thấy textarea cho phần "Content to report" (#link).');
}

// ========== Flows ==========
async function doEmailStep(page, email) {
  await page.waitForSelector(`#${cssEscapeId("email")} input[type="text"]`, { visible: true });
  await page.type(`#${cssEscapeId("email")} input[type="text"]`, email);

  await sleep(300); // nhỏ để UI enable nút

  const clicked = await clickButtonByText(page, "Next");
  if (!clicked) {
    const btn = await page.$("button");
    if (btn) await btn.click();
  }

  await Promise.race([
    page.waitForSelector(`#${cssEscapeId("name")} input`, { visible: true, timeout: 60000 }),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  ]);
}

async function doMainForm(page) {
  // Contact info (KHÔNG điền email vì read-only)
  await typeInto(page, "name", data.name);
  await typeInto(page, "nameOfOwner", data.nameOfOwner);
  await typeInto(page, "address", data.address);
  await typeInto(page, "phoneNumber", data.phoneNumber);

  // Issue type → chọn No
  await selectIssueNo(page);

  // Relationship → Authorized agent → lộ "authorizations"
  await clickRadioByLabel(page, "relationship", "I am an authorized agent of the trademark owner");

  // Upload Proof of authorization
  await page.waitForSelector(`#${cssEscapeId("authorizations")}`, { timeout: 60000 });
  await uploadFile(page, "authorizations", proofPath);

  // Registration info
  await typeInto(page, "jurisdiction", data.jurisdiction);
  await typeInto(page, "registrationNumber", data.registrationNumber);
  await typeInto(page, "goodsServiceClass", data.goods);
  if (data.recordUrl) await typeInto(page, "recordUrl", data.recordUrl);

  // Upload certificate nếu có
  if (fs.existsSync(certificatePath)) {
    await page.waitForSelector(`#${cssEscapeId("certificate")}`, { timeout: 60000 });
    await uploadFile(page, "certificate", certificatePath);
  }

  // Content to report (URLs)
  if (data.records?.length) {
    await typeRecords(page, data.records);
  }

  // Was the reported content taken from your personal TikTok account? -> No/Yes
  await clickRadioByLabel(page, "personalAccount", data.personalAccount);

  // Description (textarea trong container #description)
  await typeInto(page, "description", data.description);

  // Statements (3 checkbox)
  await tickAllCheckboxes(page, "agreement");

  // Signature
  await typeInto(page, "signature", data.signature);

  // // Gửi nếu muốn:
  // await clickButtonByText(page, "Send");
}

// ========== Entrypoints ==========
(async () => {
  if (MODE === "attach") {
    // Chrome mở sẵn với remote debugging: chrome --remote-debugging-port=9222
    const browser = await puppeteerCore.connect({ browserURL: "http://127.0.0.1:9222" });
    const pages = await browser.pages();

    let page = null;
    for (const p of pages) {
      try {
        if (await p.$(`#${cssEscapeId("name")} input`)) { page = p; break; }
      } catch {}
    }
    if (!page) {
      page = pages.find((p) => p.url().includes("/legal/report/Trademark")) || pages[0];
      await page.bringToFront();
      if (await page.$(`#${cssEscapeId("email")} input[type="text"]`)) {
        await doEmailStep(page, EMAIL);
      }
    }
    await page.bringToFront();
    await doMainForm(page);
    console.log("✅ Đã điền xong form (attach).");
  } else {
    // FULL: tool làm cả email + form
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const [page] = await browser.pages();
    await page.goto(FORM_URL, { waitUntil: "networkidle2" });
    await doEmailStep(page, EMAIL);
    await doMainForm(page);
    console.log("✅ Đã điền xong form (full).");
    // await browser.close();
  }
})();
