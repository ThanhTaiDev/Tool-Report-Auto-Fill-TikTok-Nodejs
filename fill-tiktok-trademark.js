// fill-tiktok-trademark.js
// npm i puppeteer puppeteer-core
const puppeteer = require("puppeteer");
const fs = require("fs");

// Lấy dữ liệu cấu hình từ file riêng
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

// Cấu hình chạy
const MODE = process.env.MODE || "full";
// Nếu true => tự động bấm Send; false => chờ user bấm hoặc tự bấm sau timeout
const AUTO_SUBMIT = true;

// Thời gian chờ khi AUTO_SUBMIT = false (ms). Nếu user không click trong khoảng này -> tool tự bấm
const MANUAL_REVIEW_TIMEOUT_MS = 60 * 1000; // 60s (thay đổi tuỳ bạn)

// Cấu hình tốc độ
const TYPING_DELAY_MS = 35; // ms/ký tự
const BETWEEN_ACTION_MS = 250; // ms giữa các thao tác nhỏ
const RATE_LIMIT_MS = 3 * 60 * 1000; // Nghỉ sau mỗi đơn (3 phút)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cssEscapeId = (id) =>
  id.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");

async function waitForContainer(page, rawId) {
  const esc = cssEscapeId(rawId);
  await page.waitForSelector(`#${esc}, [id="${rawId}"]`, {
    visible: true,
    timeout: 60000,
  });
  await page.evaluate((rawId) => {
    const safe =
      (window.CSS && CSS.escape)
        ? CSS.escape(rawId)
        : rawId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");
    const el =
      document.querySelector(`#${safe}`) ||
      document.querySelector(`[id="${rawId}"]`);
    if (el) el.scrollIntoView({ block: "center" });
  }, rawId);
}

// gõ text tự nhiên
async function typeInto(page, containerId, value) {
  const esc = cssEscapeId(containerId);
  await page.waitForSelector(`#${esc}, [id="${containerId}"]`, { timeout: 60000 });

  const selectors = [
    `#${esc} textarea`,
    `[id="${containerId}"] textarea`,
    `#${esc} input`,
    `[id="${containerId}"] input`,
    `#${esc} [contenteditable="true"]`,
    `[id="${containerId}"] [contenteditable="true"]`,
  ];

  let el = null;
  for (const sel of selectors) {
    el = await page.$(sel);
    if (el) break;
  }
  if (!el) throw new Error(`Không tìm thấy input/textarea cho "${containerId}"`);

  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  try {
    await el.click({ clickCount: 3 });
  } catch {}

  const tag = await page.evaluate((n) => n.tagName.toLowerCase(), el);
  if (tag === "input" || tag === "textarea") {
    await el.type(value || "", { delay: TYPING_DELAY_MS });
  } else {
    // contenteditable
    await page.keyboard.down("Control");
    await page.keyboard.press("A");
    await page.keyboard.up("Control");
    await page.keyboard.type(value || "", { delay: TYPING_DELAY_MS });
  }
  await sleep(BETWEEN_ACTION_MS);
}

async function uploadFile(page, containerId, filePath) {
  const esc = cssEscapeId(containerId);
  let input =
    (await page.$(`#${esc} input[type="file"]`)) ||
    (await page.$(`#input-file-${containerId}`));

  if (!input) {
    const label =
      (await page.$(`#${esc} label[for]`)) ||
      (await page.$(`#${esc} .choose-file-button`)) ||
      (await page.$(`label[for="input-file-${containerId}"]`));
    if (label) await label.click();
    await sleep(200);
    input =
      (await page.$(`#${esc} input[type="file"]`)) ||
      (await page.$(`#input-file-${containerId}`));
  }
  if (!input) throw new Error(`Không tìm thấy input file cho "${containerId}"`);
  await input.uploadFile(filePath);
  await sleep(BETWEEN_ACTION_MS);
}

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
  await sleep(BETWEEN_ACTION_MS);
}

async function tickAllCheckboxes(page, containerId) {
  const esc = cssEscapeId(containerId);
  const realInputs = await page.$$(`#${esc} input[type="checkbox"]`);
  if (realInputs.length) {
    for (const cb of realInputs) {
      await cb.evaluate((el) => el.scrollIntoView({ block: "center" }));
      try {
        await cb.click({ offset: { x: 4, y: 4 } });
      } catch {
        const parent = (await cb.getProperty("parentElement")).asElement();
        if (parent) await parent.click();
      }
      await sleep(BETWEEN_ACTION_MS);
    }
    return;
  }
  const wrappers = await page.$$(
    `#${esc} [data-tux-checkbox-input-wrapper="true"], #${esc} label`
  );
  for (const w of wrappers) {
    await w.click();
    await sleep(BETWEEN_ACTION_MS);
  }
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
    if (target) {
      target.click();
      return true;
    }
    return false;
  }, text);
  return clicked;
}

// chọn "Yes" cho phần counterfeit goods
async function selectIssueYes(page) { // 
  const name = "extra.cfGoods";
  await waitForContainer(page, name);
  
  // lấy danh sách radio theo name
  const radios = await page.$$(`input[type="radio"][name="${name}"]`);
  
  // nếu có ít nhất 2 lựa chọn: [0] = Yes, [1] = No
  if (radios.length >= 2) {
    await radios[0].evaluate((el) => el.scrollIntoView({ block: "center" }));
    await radios[0].click({ offset: { x: 4, y: 4 } }); // chọn Yes
  } else if (radios.length === 1) {
    // fallback: chỉ có 1 radio, vẫn click để chắc chắn
    await radios[0].evaluate((el) => el.scrollIntoView({ block: "center" }));
    await radios[0].click({ offset: { x: 4, y: 4 } });
  } else {
    throw new Error("Không tìm thấy radio cho 'extra.cfGoods'");
  }

  await sleep(BETWEEN_ACTION_MS);
}


async function typeRecords(page, records) {
  const value = (records || []).join("\n");
  await page.waitForSelector("#link, [id='link']", { timeout: 60000 });
  const el =
    (await page.$("#link textarea")) ||
    (await page.$("[id='link'] textarea")) ||
    (await page.$("#link [contenteditable='true']")) ||
    (await page.$("[id='link'] [contenteditable='true']"));
  if (!el) throw new Error("Không tìm thấy textarea phần records.");
  await el.evaluate((n) => n.scrollIntoView({ block: "center" }));
  await el.click();
  // Ctrl/Cmd + A
  const isMac = await page.evaluate(() => navigator.platform.includes("Mac"));
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
  await el.type(value, { delay: TYPING_DELAY_MS });
  await sleep(BETWEEN_ACTION_MS);
}

/**
 * Nếu AUTO_SUBMIT = true -> bấm send và đợi confirm/toast/navigation rồi nghỉ RATE_LIMIT_MS.
 * Nếu AUTO_SUBMIT = false -> đợi user bấm Send (listener client-side) trong MANUAL_REVIEW_TIMEOUT_MS.
 *    - Nếu user bấm -> tiếp tục ngay.
 *    - Nếu timeout -> auto bấm Send rồi tiếp tục.
 */
async function submitOrWaitManual(page) {
  if (AUTO_SUBMIT) {
    console.log("AUTO_SUBMIT = true -> tự động bấm Send và đợi confirm...");
    const clicked = await clickButtonByText(page, "Send");
    if (!clicked) {
      const btn = await page.$('button[type="submit"], input[type="submit"]');
      if (btn) await btn.click();
    }
    // chờ toast hoặc navigation ngắn
    await Promise.race([
      page.waitForSelector(".tux-toast, [role='status']", { timeout: 15000 }).catch(() => {}),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
      sleep(4000),
    ]);
    console.log(`⏳ Nghỉ ${RATE_LIMIT_MS / 1000} giây trước nhóm tiếp theo...`);
    await sleep(RATE_LIMIT_MS);
    return;
  }

  // ---------- AUTO_SUBMIT = false: chờ user review ----------
  console.log(`AUTO_SUBMIT = false -> chờ bạn kiểm tra. Nếu không bấm trong ${MANUAL_REVIEW_TIMEOUT_MS/1000}s thì tool tự bấm Send.`);

  // gắn listener client-side để phát hiện click nút Send
  await page.evaluate(() => {
    // reset flag
    window.__userClickedSend = false;
    // remove previous listeners (an toàn)
    if (window.__sendListenerCleanup) {
      try { window.__sendListenerCleanup(); } catch (e) {}
      window.__sendListenerCleanup = null;
    }

    const nodes = [
      ...document.querySelectorAll("button"),
      ...document.querySelectorAll('[role="button"]'),
      ...document.querySelectorAll('input[type="submit"], input[type="button"]'),
    ];
    const listeners = [];
    for (const n of nodes) {
      const text = ((n.innerText || n.value || "") + "").toLowerCase();
      if (text.includes("send")) {
        const handler = () => { window.__userClickedSend = true; };
        n.addEventListener("click", handler, { once: true });
        listeners.push({ n, handler });
      }
    }
    // Provide cleanup function for future runs
    window.__sendListenerCleanup = () => {
      for (const it of listeners) {
        try { it.n.removeEventListener("click", it.handler); } catch (e) {}
      }
      window.__userClickedSend = window.__userClickedSend || false;
    };
  });

  // chờ user click flag hoặc timeout
  let userClicked = false;
  try {
    await page.waitForFunction("window.__userClickedSend === true", { timeout: MANUAL_REVIEW_TIMEOUT_MS });
    userClicked = true;
  } catch (e) {
    userClicked = false;
  }

  if (userClicked) {
    console.log("Bạn đã bấm Send -> tiếp tục.");
    // chờ navigation/toast ngắn (nếu có)
    await Promise.race([
      page.waitForSelector(".tux-toast, [role='status']", { timeout: 15000 }).catch(() => {}),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
      sleep(2000),
    ]);
    console.log(`⏳ Nghỉ ${RATE_LIMIT_MS / 1000} giây trước nhóm tiếp theo...`);
    await sleep(RATE_LIMIT_MS);
    return;
  } else {
    console.log(`Bạn không bấm trong ${MANUAL_REVIEW_TIMEOUT_MS/1000}s -> tool sẽ tự bấm Send bây giờ.`);
    const clicked = await clickButtonByText(page, "Send");
    if (!clicked) {
      const btn = await page.$('button[type="submit"], input[type="submit"]');
      if (btn) await btn.click();
    }
    await Promise.race([
      page.waitForSelector(".tux-toast, [role='status']", { timeout: 15000 }).catch(() => {}),
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 15000 }).catch(() => {}),
      sleep(4000),
    ]);
    console.log(`⏳ Nghỉ ${RATE_LIMIT_MS / 1000} giây trước nhóm tiếp theo...`);
    await sleep(RATE_LIMIT_MS);
    return;
  }
}

// Flows
async function doEmailStep(page, email) {
  await page.waitForSelector(`#${cssEscapeId("email")} input[type="text"]`, { visible: true });
  await page.type(`#${cssEscapeId("email")} input[type="text"]`, email, { delay: TYPING_DELAY_MS });
  await sleep(BETWEEN_ACTION_MS);
  await clickButtonByText(page, "Next");
  await Promise.race([
    page.waitForSelector(`#${cssEscapeId("name")} input`, { visible: true, timeout: 60000 }),
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }).catch(() => {}),
  ]);
}

async function doMainForm(page, urls = []) {
  await typeInto(page, "name", data.name);
  await typeInto(page, "nameOfOwner", data.nameOfOwner);
  await typeInto(page, "address", data.address);
  await typeInto(page, "phoneNumber", data.phoneNumber);

  await selectIssueYes(page);
  await clickRadioByLabel(page, "relationship", "I am an authorized agent");
  await uploadFile(page, "authorizations", proofPath);

  await typeInto(page, "jurisdiction", data.jurisdiction);
  await typeInto(page, "registrationNumber", data.registrationNumber);
  await typeInto(page, "goodsServiceClass", data.goods);
  await typeInto(page, "recordUrl", data.recordUrl);

  if (fs.existsSync(certificatePath)) await uploadFile(page, "certificate", certificatePath);

  const records = urls.length ? urls : data.records;
  if (records?.length) await typeRecords(page, records);

  await clickRadioByLabel(page, "personalAccount", data.personalAccount);
  await typeInto(page, "description", data.description);
  await tickAllCheckboxes(page, "agreement");
  await typeInto(page, "signature", data.signature);

  // thay vì gọi submitAndConfirm, gọi submitOrWaitManual (hỗ trợ manual-mode)
  await submitOrWaitManual(page);
}

// MAIN
(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    // executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", // nếu cần chỉ định chrome
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
      console.log(`✅ Xử lý xong nhóm ${index + 1}`);
      if (index < batches.length - 1) {
        // load lại form cho nhóm tiếp theo
        console.log("⟲ Tải lại form cho nhóm tiếp theo...");
        await page.goto(FORM_URL, { waitUntil: "networkidle2" });
        await doEmailStep(page, EMAIL);
      }
    }
    console.log("🎯 Hoàn tất toàn bộ URL!");
  } else {
    await doMainForm(page, allUrls);
    console.log("✅ Đã gửi toàn bộ URL trong 1 lần.");
  }

  // giữ browser mở để bạn kiểm tra; nếu muốn tự đóng thì mở comment dưới
  // await browser.close();
})();
