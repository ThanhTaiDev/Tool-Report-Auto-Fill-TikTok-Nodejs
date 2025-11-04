const path = require("path");
const fs = require("fs");
const FORM_URL =
  "https://ipr.tiktokforbusiness.com/legal/report/Trademark?issueType=1&behalf=2&sole=2";

// === Dữ liệu form cố định ===
const EMAIL = "begsondye@kpost.be";
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
// Ủy quyền LOA
const proofPath = path.resolve(__dirname, "LOA - The Anti-Counterfeiting Group (1).pdf");

// chứng nhận đăng ký
const certificatePath = path.resolve(__dirname, "103683 - Certificate of Registration.pdf");

// === Tùy chọn gửi ===
const BATCH_SIZE = 3;      // gửi 1 video 1 lần
const BATCH_MODE = true;   // true = bật gửi theo nhóm





// === Đọc file URLs ===
const urldame = path.resolve(__dirname, "urldame.txt");
const allUrls = fs.readFileSync(urldame, "utf8")
  .split(/\r?\n/)
  .map((x) => x.trim())
  .filter(Boolean); // bỏ dòng trống

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
