/**
 * نقطة الدخول: بتشتغل لما حد يفتح لينك الفورم
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Nova Group | Employee Onboarding')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * بتدمج ملف HTML جوه ملف تاني (هنستخدمها للـ CSS والـ JavaScript)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===== إعدادات الشيت =====
const SHEET_NAME = 'Employees';
const HEADERS = [
  'Timestamp', 'Full Name', 'Nationality', 'National ID', 'Passport No',
  'Residency Expiry', 'Phone', 'Email', 'Department', 'Hire Date', 'Language'
];

/**
 * بتتشغل مرة واحدة بس: بتعمل الشيت وعناوين الأعمدة
 */
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight('bold')
    .setBackground('#0f4c5c')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

/**
 * بتستقبل البيانات من الفورم وتحفظها في صف جديد
 */
function submitForm(data) {
  // التحقق على السيرفر كمان، لأن أي حد ممكن يتخطى التحقق اللي في المتصفح
  validateOnServer(data);

  // قفل عشان لو اتنين بعتوا في نفس اللحظة الصفوف متتلخبطش
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      new Date(),
      data.fullName.trim(),
      data.nationality,
      data.nationality === 'EG' ? "'" + data.nationalId : '',
      data.nationality === 'OTHER' ? data.passportNo.trim() : '',
      data.nationality === 'OTHER' ? data.residencyExpiry : '',
      "'" + data.phone.trim(),
      data.email.trim().toLowerCase(),
      data.department,
      data.hireDate,
      data.lang
    ]);
  } finally {
    lock.releaseLock();
  }

  return { ok: true };
}

function validateOnServer(data) {
  const required = ['fullName', 'nationality', 'phone', 'email', 'department', 'hireDate'];
  required.forEach(function (key) {
    if (!data[key] || !String(data[key]).trim()) {
      throw new Error('Missing field: ' + key);
    }
  });
  if (data.nationality === 'EG' && !/^\d{14}$/.test(data.nationalId)) {
    throw new Error('Invalid national ID');
  }
  if (data.nationality === 'OTHER' && (!data.passportNo || !data.residencyExpiry)) {
    throw new Error('Missing passport data');
  }
}