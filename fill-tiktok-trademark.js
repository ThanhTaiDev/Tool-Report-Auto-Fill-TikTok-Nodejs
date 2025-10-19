const puppeteer = require("puppeteer");
const path = require("path");

const FORM_URL = "https://www.tiktok.com/legal/report/trademark";
const proofPath = path.resolve(__dirname, "POA.pdf");

// Escape ID để dùng trong CSS selector (xử lý dấu chấm, ngoặc, v.v.)
const cssEscapeId = (id) =>
  id.replace(/([ #.;?%&,+*~:'"!^$[\]()=>|/@\\])/g, "\\$1");

// click radio theo label text trong 1 container id
async function clickRadioByLabel(page, containerId, wantedText) {
  const esc = cssEscapeId(containerId);
  await page.waitForSelector(`#${esc}`, { visible: true });

  // thử click theo label text
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
        if (input) {
          (input).click();
          return true;
        }
      }
    }
    return false;
  }, { containerId, wantedText });

  if (!ok) {
    // fallback: thử theo value Yes/No
    const sel =
      wantedText.toLowerCase() === "yes"
        ? `#${esc} input[type="radio"]:first-of-type`
        : `#${esc} input[type="radio"]:last-of-type`;
    if (await page.$(sel)) await page.click(sel);
  }
}

// upload file vào container có id
async function uploadFile(page, containerId, filePath) {
  const esc = cssEscapeId(containerId);
  // Nhiều trang render input[type=file] ẩn sau label – query trực tiếp input
  await page.waitForSelector(`#${esc} input[type="file"]`, { visible: true });
  const file = await page.$(`#${esc} input[type="file"]`);
  await file.uploadFile(filePath);
}

(async () => {
  const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
  const page = await browser.newPage();
  await page.goto(FORM_URL, { waitUntil: "networkidle2" });

  // 1) Issue type → chọn "No"
  // container id có dấu chấm: "extra.c6goods" → cần escape
  await clickRadioByLabel(page, "extra.c6goods", "No");

  // 2) Relationship → chọn "I am an authorized agent of the trademark owner"
  await clickRadioByLabel(page, "relationship", "I am an authorized agent of the trademark owner");

  // 3) Chờ trường Proof of authorization hiện ra rồi upload
  // container id: "authorizations"
  await page.waitForSelector(`#${cssEscapeId("authorizations")}`, { visible: true });
  await uploadFile(page, "authorizations", proofPath);

  console.log("✅ Đã chọn 2 radio & upload POA.");
  // await browser.close();
})();
