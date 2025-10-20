// fill-tiktok-trademark.js
// npm i puppeteer puppeteer-core
const puppeteer = require("puppeteer");
const puppeteerCore = require("puppeteer-core");
const fs = require("fs");

// ⬇️ Lấy dữ liệu cấu hình & URL từ file riêng
const {
  EMAIL,
  FORM_URL,
  proofPath,
  certificatePath,
  data,
  allUrls,
  BATCH_MODE,
  BATCH_SIZE,
} = require("./form-data");

// Chế độ chạy: full | attach (giữ cho tương lai nếu cần)
const MODE = process.env.MODE || "full";

// Tự động bấm Send sau khi điền form
const AUTO_SUBMIT = true;

// Utility nhỏ
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ================== HELPERS ==================
const cssEscapeId = (id) =>
  id.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");

async function waitForContainer(page, rawId) {
  const esc = cssEscapeId(rawId);
  await page.waitForSelector(`#${esc}, [id="${rawId}"]`, { visible: true, timeout: 60000 });
  await page.evaluate((rawId) => {
    const safe = (window.CSS && CSS.escape)
      ? CSS.escape(rawId)
      : rawId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const el = document.querySelector(`#${safe}`) || document.querySelector(`[id="${rawId}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }, rawId);
}

// gõ text tự nhận input / textarea / contenteditable
async function typeInto(page, containerId, value) {
  const esc = cssEscapeId(containerId);
  await page.waitForSelector(`#${esc}, [id="${containerId}"]`, { timeout: 60000 });

  const selectors = [
    `#${esc} textarea`, `[id="${containerId}"] textarea`,
    `#${esc} input`, `[id="${containerId}"] input`,
    `#${esc} [contenteditable="true"]`, `[id="${containerId}"] [contenteditable="true"]`,
  ];

  let el = null;
  for (const sel of selectors) { el = await page.$(sel); if (el) break; }
  if (!el) throw new Error(`Không tìm thấy input/textarea cho "${containerId}"`);

  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  try { await el.click({ clickCount: 3 }); } catch {}

  const tag = await page.evaluate((n) => n.tagName.toLowerCase(), el);
  if (tag === "input" || tag === "textarea") {
    await el.type(value || "");
  } else {
    // contenteditable
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type(value || "");
  }
}

async function uploadFile(page, containerId, filePath) {
  const esc = cssEscapeId(containerId);
  let input = await page.$(`#${esc} input[type="file"]`) || await page.$(`#input-file-${containerId}`);

  if (!input) {
    const label = await page.$(`#${esc} label[for]`) ||
                  await page.$(`#${esc} .choose-file-button`) ||
                  await page.$(`label[for="input-file-${containerId}"]`);
    if (label) await label.click();
    await new Promise((r) => setTimeout(r, 200));
    input = await page.$(`#${esc} input[type="file"]`) || await page.$(`#input-file-${containerId}`);
  }
  if (!input) throw new Error(`Không tìm thấy input file cho "${containerId}"`);
  await input.uploadFile(filePath);
}

async function clickRadioByLabel(page, containerId, wantedText) {
  const esc = cssEscapeId(containerId);
  await page.waitForSelector(`#${esc}, [id="${containerId}"]`, { visible: true });
  const ok = await page.evaluate(({ containerId, wantedText }) => {
    const root =
      document.querySelector(`#${containerId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1")}`) ||
      document.querySelector(`[id="${containerId}"]`);
    if (!root) return false;
    const labels = root.querySelectorAll("label");
    for (const lb of labels) {
      const t = (lb.textContent || "").trim().toLowerCase();
      if (t.includes(wantedText.toLowerCase())) {
        const input = lb.querySelector('input[type="radio"]') ||
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
  const wrappers = await page.$$(`#${esc} [data-tux-checkbox-input-wrapper="true"], #${esc} label`);
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

// chọn "No" cho phần counterfeit goods
async function selectIssueNo(page) {
  const name = "extra.cfGoods";
  await waitForContainer(page, name);
  const radios = await page.$$(`input[type="radio"][name="${name}"]`);
  if (radios.length >= 2) {
    await radios[1].evaluate((el) => el.scrollIntoView({ block: "center" }));
    try {
      await radios[1].click({ offset: { x: 4, y: 4 } });
      const ok = await page.evaluate((el) => el.checked, radios[1]);
      if (ok) return;
    } catch {}
  }
  await page.evaluate((name) => {
    const ip = document.querySelectorAll(`input[type="radio"][name="${name}"]`)[1];
    if (ip) {
      ip.checked = true;
      ip.dispatchEvent(new Event("input", { bubbles: true }));
      ip.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, name);
}

// điền URLs phần Content to report
async function typeRecords(page, records) {
  const value = (records || []).join("\n");
  await page.waitForSelector('#link, [id="link"]', { timeout: 60000 });
  const el =
    (await page.$('#link textarea')) ||
    (await page.$('[id="link"] textarea')) ||
    (await page.$('#link [contenteditable="true"]')) ||
    (await page.$('[id="link"] [contenteditable="true"]'));
  if (!el) throw new Error("Không tìm thấy textarea phần records.");
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await el.click();
  await page.keyboard.down("Control");
  await page.keyboard.press("A");
  await page.keyboard.up("Control");
  await el.type(value);
}

// ================== SUBMIT FLOW ==================
async function submitAndConfirm(page) {
  const clicked = await clickButtonByText(page, "Send");
  if (!clicked) {
    // dự phòng: tìm input submit/btn trong vùng cuối form
    const btn = await page.$('button[type="submit"], input[type="submit"]');
    if (btn) await btn.click();
  }

  // chờ một trong các tín hiệu thành công / chuyển trang
  await Promise.race([
    // toast/status của TUX (nếu có)
    page.waitForSelector('.tux-toast, ._toast, [role="status"]', { timeout: 15000 }).catch(() => {}),
    // form biến mất (name input không còn)
    page.waitForSelector(`#${cssEscapeId("name")} input`, { hidden: true, timeout: 15000 }).catch(() => {}),
    // điều hướng
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
    // hoặc chỉ đơn giản nghỉ ngắn
    sleep(3000),
  ]);
}

// ================== FORM FLOW ==================
async function doEmailStep(page, email) {
  await page.waitForSelector(`#${cssEscapeId("email")} input[type="text"]`, { visible: true });
  await page.type(`#${cssEscapeId("email")} input[type="text"]`, email);
  await sleep(300);
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

async function doMainForm(page, urls = []) {
  // Contact info
  await typeInto(page, "name", data.name);
  await typeInto(page, "nameOfOwner", data.nameOfOwner);
  await typeInto(page, "address", data.address);
  await typeInto(page, "phoneNumber", data.phoneNumber);

  // Issue type → No
  await selectIssueNo(page);

  // Relationship
  await clickRadioByLabel(page, "relationship", "I am an authorized agent");

  // Upload proof
  await uploadFile(page, "authorizations", proofPath);

  // Registration info
  await typeInto(page, "jurisdiction", data.jurisdiction);
  await typeInto(page, "registrationNumber", data.registrationNumber);
  await typeInto(page, "goodsServiceClass", data.goods);
  await typeInto(page, "recordUrl", data.recordUrl);
  if (fs.existsSync(certificatePath)) {
    await uploadFile(page, "certificate", certificatePath);
  }

  // URLs
  const records = urls.length ? urls : data.records;
  if (records?.length) await typeRecords(page, records);

  // Personal account
  await clickRadioByLabel(page, "personalAccount", data.personalAccount);

  // Description
  await typeInto(page, "description", data.description);

  // Checkbox
  await tickAllCheckboxes(page, "agreement");

  // Signature
  await typeInto(page, "signature", data.signature);

  // Auto submit nếu bật
  if (AUTO_SUBMIT) {
    await submitAndConfirm(page);
  }
}

// ================== MAIN ==================
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });

  const [page] = await browser.pages();
  await page.goto(FORM_URL, { waitUntil: "networkidle2" });
  await doEmailStep(page, EMAIL);

  if (BATCH_MODE) {
    const batches = [];
    for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
      batches.push(allUrls.slice(i, i + BATCH_SIZE));
    }

    for (const [index, urls] of batches.entries()) {
      console.log(`🚀 Nhóm ${index + 1}/${batches.length}: ${urls.length} URL`);
      await doMainForm(page, urls);
      console.log(`✅ Đã xử lý nhóm ${index + 1}`);

      if (index < batches.length - 1) {
        // Sau khi gửi xong 1 nhóm → nạp lại form & đi bước email
        await page.goto(FORM_URL, { waitUntil: "networkidle2" });
        await doEmailStep(page, EMAIL);
      }
    }
    console.log("🎯 Đã gửi hết tất cả URL!");
  } else {
    await doMainForm(page, allUrls);
    console.log("✅ Đã gửi toàn bộ URL trong 1 lần.");
  }

  // Đóng tự động nếu muốn:
  // await browser.close();
})();
