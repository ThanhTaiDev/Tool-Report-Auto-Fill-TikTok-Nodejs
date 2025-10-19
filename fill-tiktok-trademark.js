// npm i puppeteer puppeteer-core
const puppeteer = require("puppeteer");
const puppeteerCore = require("puppeteer-core");
const path = require("path");

/** ============== CẤU HÌNH ============== */
const MODE = process.env.MODE || "full"; // "full" | "attach"
const EMAIL = "begsondye@kpost.be";       // email bước Verify
const FORM_URL = "https://ipr.tiktokforbusiness.com/legal/report/Trademark?issueType=1&behalf=2&sole=2";

const proofPath = path.resolve(__dirname, "POA.pdf"); // Proof of authorization

// Dữ liệu form chính
const data = {
  name: "Vo Van Thanh Tai",
  nameOfOwner: "Disney Enterprises, Inc.",
  address: "500 S Buena Vista St, Burbank, CA 91521, USA",
  phoneNumber: "+84 909 999 999",
  email: "law@disney.com",
  jurisdiction: "United States",
  registrationNumber: "1234567",
  goods: "Class 25 – Clothing, footwear, headgear",
  recordUrl: "https://tmsearch.uspto.gov/trademark/example",
  records: [
    "https://www.tiktok.com/@fakebrand/video/1111111111111111111",
    "https://www.tiktok.com/@fakebrand/video/2222222222222222222",
  ],
  personalAccount: "No",
  description: "The account uses our registered trademark without authorization.",
  signature: "Vo Van Thanh Tai",
};
/** ====================================== */

// ========== Helpers ==========
const cssEscapeId = (id) =>
  id.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");

// chờ container theo cả #extra\.c6goods và [id="extra.c6goods"]
async function waitForContainer(page, rawId) {
  const esc = cssEscapeId(rawId);
  const sel1 = `#${esc}`;
  const sel2 = `[id="${rawId}"]`;
  await page.waitForSelector(`${sel1}, ${sel2}`, { visible: true, timeout: 60000 });
  // kéo vào giữa màn hình để các radio/checkbox nhận click chắc hơn
  await page.evaluate((rawId) => {
    const el = document.querySelector(`#${rawId.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1")}`) 
            || document.querySelector(`[id="${rawId}"]`);
    if (el) el.scrollIntoView({ block: "center", behavior: "instant" });
  }, rawId);
}


async function typeInto(page, containerId, value, isTextarea = false) {
  const esc = cssEscapeId(containerId);
  const selector = isTextarea
    ? `#${esc} textarea, #${esc} [contenteditable="true"]`
    : `#${esc} input`;
  await page.waitForSelector(selector, { visible: true });
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value || "");
}

async function uploadFile(page, containerId, filePath) {
  const esc = cssEscapeId(containerId);
  const sel = `#${esc} input[type="file"]`;
  await page.waitForSelector(sel, { visible: true });
  const file = await page.$(sel);
  await file.uploadFile(filePath);
}

async function clickRadioByLabel(page, containerId, wantedText) {
  const esc = cssEscapeId(containerId);
  await page.waitForSelector(`#${esc}`, { visible: true });

  const ok = await page.evaluate(({ containerId, wantedText }) => {
    const root = document.querySelector(`#${containerId}`);
    if (!root) return false;
    const labels = root.querySelectorAll("label");
    for (const lb of labels) {
      const t = lb.textContent?.trim().toLowerCase();
      if (t && t.includes(wantedText.toLowerCase())) {
        const input =
          lb.querySelector('input[type="radio"]') ||
          lb.closest("div")?.querySelector('input[type="radio"]');
        if (input) { (input).click(); return true; }
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
  // fallback: một số UI ẩn input, click wrapper/label
  const wrappers = await page.$$(
    `#${esc} [data-tux-checkbox-input-wrapper="true"], #${esc} label`
  );
  for (const w of wrappers) await w.click();
}

async function clickButtonByText(page, text) {
  // Tìm tất cả button/role=button/input submit rồi so text
  const clicked = await page.evaluate((wanted) => {
    const nodes = [
      ...document.querySelectorAll('button'),
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


// ========== Flows ==========
async function doEmailStep(page, email) {
  // ô email nằm trong container id="email"
  await page.waitForSelector(`#${cssEscapeId("email")} input[type="text"]`, { visible: true });
  await page.type(`#${cssEscapeId("email")} input[type="text"]`, email);

  // click Next
  const clicked = await clickButtonByText(page, "Next");
  if (!clicked) {
    // fallback: click button đỏ đầu tiên trong section
    const btn = await page.$('button');
    if (btn) await btn.click();
  }

  // đợi tới khi form lớn xuất hiện (ví dụ container #name)
  await page.waitForSelector(`#${cssEscapeId("name")} input`, { visible: true, timeout: 60000 });
}

async function doMainForm(page) {
  // Contact info
  await typeInto(page, "name", data.name);
  await typeInto(page, "nameOfOwner", data.nameOfOwner);
  await typeInto(page, "address", data.address);
  await typeInto(page, "phoneNumber", data.phoneNumber);

  // Issue type → chọn No (container id có dấu chấm)
  await waitForContainer(page, "extra.c6goods");
  await clickRadioByLabel(page, "extra.c6goods", "No");

  // Relationship → Authorized agent → sẽ lộ "authorizations"
  await clickRadioByLabel(page, "relationship", "I am an authorized agent of the trademark owner");

  // Upload Proof of authorization
  await page.waitForSelector(`#${cssEscapeId("authorizations")}`, { visible: true });
  await uploadFile(page, "authorizations", proofPath);

  // Registration info
  await typeInto(page, "jurisdiction", data.jurisdiction);
  await typeInto(page, "registrationNumber", data.registrationNumber);
  await typeInto(page, "goods", data.goods);

  // (nếu có chứng nhận đăng ký riêng: #certificate)
  // await uploadFile(page, "certificate", path.resolve(__dirname, "certificate.pdf"));

  if (data.recordUrl) await typeInto(page, "recordUrl", data.recordUrl);

  // Content to report
  if (data.records?.length) {
    await typeInto(page, "records", data.records.join("\n"), true);
  }
  await clickRadioByLabel(page, "personalAccount", data.personalAccount);
  await typeInto(page, "description", data.description, true);

  // Statements (3 checkbox)
  await tickAllCheckboxes(page, "agreement");

  // Signature
  await typeInto(page, "signature", data.signature);

  // Gửi nếu muốn:
  // await clickButtonByText(page, "Send");
}

// ========== Entrypoints ==========
(async () => {
  if (MODE === "attach") {
    // Bạn tự điền email và bấm Next trước.
    // Mở Chrome với remote debugging:  chrome --remote-debugging-port=9222
    const browser = await puppeteerCore.connect({ browserURL: "http://127.0.0.1:9222" });
    const pages = await browser.pages();

    // cố gắng tìm tab đã mở form lớn (có #name)
    let page = null;
    for (const p of pages) {
      try {
        if (await p.$(`#${cssEscapeId("name")} input`)) { page = p; break; }
      } catch {}
    }
    // nếu chưa bấm Next, dùng tab có URL chứa /legal/report/Trademark và làm luôn bước email
    if (!page) {
      page = pages.find(p => p.url().includes("/legal/report/Trademark")) || pages[0];
      await page.bringToFront();
      if (await page.$(`#${cssEscapeId("email")} input[type="text"]`)) {
        await doEmailStep(page, EMAIL); // tự gõ email + Next
      } else {
        // đã qua email -> nothing
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
