const path = require("path");
const fs = require("fs");
const FORM_URL =
  "https://ipr.tiktokforbusiness.com/legal/report/Trademark?issueType=1&behalf=2&sole=2";

// === Dữ liệu form cố định ===
const EMAIL = "brandprotection-vespa@redpoints-us.com";
const data = {
  name: "Red Points",
  nameOfOwner: "PIAGGIO C. S.P.A.",
  address: "135 Madison Ave, 5th Floor, New York, NY 10016, USA",
  phoneNumber: "+1 282 282 2222",
  jurisdiction: "UK",
  registrationNumber: "UK00000678204",
  goods: "class 12, Motor cycles",
  recordUrl: "https://trademarks.ipo.gov.uk/ipo-tmcase/page/Results/1/UK00000678204",
  personalAccount: "No",
  description: "We act as the authorised representative of PIAGGIO & C. S.P.A., the owner of the “VESPA” word mark, the VESPA logo device mark, and other related trademarks, trade dress, and brand identifiers (collectively, the “VESPA Marks”). This notice concerns multiple instances of trademark infringement and counterfeiting activity identified on the TikTok platform. These activities include, but are not limited to: Unauthorized use of the VESPA Marks (word mark, logo, stylised elements) in videos, profile names, hashtags, account handles, live-streams, product listings, and promotional materials. Promotion, advertising, offering for sale, or sale of scooters, helmets, parts, apparel, and other goods falsely presented as genuine VESPA products, which are in fact unauthorised or counterfeit. Use of imagery, packaging, or product design elements that closely imitate PIAGGIO’s official branding, marketing visuals, or showroom style, intended to mislead consumers into believing that such goods are genuine or officially approved by PIAGGIO & C. S.P.A. Creation of consumer confusion or likelihood of confusion regarding the source, origin, sponsorship, endorsement, or affiliation with PIAGGIO & C. S.P.A. or its authorised distributors, thereby damaging the goodwill, reputation, and distinctiveness of the VESPA Marks and undermining the trust and integrity of the brand. 2. Nature of Detailed Infringement For example, certain TikTok account(s) have posted videos displaying scooters, helmets, and accessories branded as “VESPA” or featuring the Vespa logo, offered at unusually low prices, often linked via profiles, comments, or live-streams to unverified external websites or online marketplaces. Some posts employ imagery and packaging that mimic PIAGGIO’s official materials, without any indication of being authorised dealers or resellers. Other cases involve live-stream selling sessions, where individuals display multiple scooters or parts claimed to be “VESPA” products — some authentic, others clearly unauthorised — and invite viewers to purchase through discount codes or third-party links. Such conduct constitutes direct misuse of the VESPA trademark, as it is carried out not for commentary, review, or comparative reference (which may be lawful), but in the commercial promotion and sale of counterfeit or unauthorised goods. These actions violate TikTok’s Intellectual Property Policy, which states: “We do not permit the purchase, sale, trade or solicitation of counterfeit goods on TikTok.” They also fall under TikTok’s definition of trademark infringement, namely: “Unauthorised use of a trademark in connection with goods or services in a way likely to cause confusion, deception, or mistake about the source, origin, sponsorship, or affiliation.” 3. Legal Basis & Trademark Ownership PIAGGIO & C. S.P.A. is the exclusive owner of the registered VESPA Marks across multiple jurisdictions and maintains worldwide protection for its trademarks and associated intellectual property assets. We submit this report with full authority to act on behalf of PIAGGIO & C. S.P.A., the rights-holder. To the best of our knowledge, none of the identified uses are authorised by PIAGGIO & C. S.P.A. or by any of its official dealers, licensees, or distributors.",
  signature: "Red Points",
};
// Ủy quyền LOA
const proofPath = path.resolve(__dirname, "LOA PIAGGIO & RED POINTS.pdf");

// chứng nhận đăng ký
const certificatePath = path.resolve(__dirname, "Intellectual Property Office-Vespa.pdf");

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
