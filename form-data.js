const path = require("path");
const fs = require("fs");

// === Cấu hình chính ===
const EMAIL = "begsondye@kpost.be";
const FORM_URL =
  "https://ipr.tiktokforbusiness.com/legal/report/Trademark?issueType=1&behalf=2&sole=2";

// Ủy quyền POA & chứng nhận đăng ký
const proofPath = path.resolve(__dirname, "POA.pdf");
const certificatePath = path.resolve(__dirname, "dd1.pdf");

// === Tùy chọn gửi ===
const BATCH_MODE = true;   // true = bật gửi theo nhóm
const BATCH_SIZE = 3;      // gửi 3 video 1 lần

// === Đọc file URLs ===
const urlFile = path.resolve(__dirname, "urls.txt");
const allUrls = fs.readFileSync(urlFile, "utf8")
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean); // bỏ dòng trống

// === Dữ liệu form cố định ===
const data = {
  name: "Vo Van Thanh Tai",
  nameOfOwner: "Disney Enterprises, Inc.",
  address: "500 S Buena Vista St, Burbank, CA 91521, USA",
  phoneNumber: "+84 909 999 999",
  jurisdiction: "United States",
  registrationNumber: "1234567",
  goods: "Class 25 – Clothing, footwear, headgear",
  recordUrl: "https://tmsearch.uspto.gov/trademark/example",
  personalAccount: "No",
  description: "The account uses our registered trademark without authorization.",
  signature: "Vo Van Thanh Tai",
};

// === Xuất ===
module.exports = {
  EMAIL,
  FORM_URL,
  proofPath,
  certificatePath,
  data,
  allUrls,
  BATCH_MODE,
  BATCH_SIZE,
};
