// form-data.js
const path = require("path");

// === Các biến có thể đổi tuỳ job ===
const EMAIL = "begsondye@kpost.be";
const FORM_URL =
  "https://ipr.tiktokforbusiness.com/legal/report/Trademark?issueType=1&behalf=2&sole=2";

// Ủy quyền POA & chứng nhận đăng ký (nếu có)
const proofPath = path.resolve(__dirname, "POA.pdf");
const certificatePath = path.resolve(__dirname, "dd1.pdf");

// Dữ liệu form chính
const data = {
  name: "Vo Van Thanh Tai",
  nameOfOwner: "Disney Enterprises, Inc.",
  address: "500 S Buena Vista St, Burbank, CA 91521, USA",
  phoneNumber: "+84 909 999 999",
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

module.exports = {
  EMAIL,
  FORM_URL,
  proofPath,
  certificatePath,
  data,
};
