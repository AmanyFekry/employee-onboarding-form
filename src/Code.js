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
  'Residency Expiry', 'Phone', 'Email', 'Department', 'Hire Date', 'Language',
  'Documents Folder'
];
// ===== إعدادات الملفات =====
const ROOT_FOLDER_NAME = 'Nova Onboarding Documents';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 ميجا

const FILE_RULES = {
  photo:         { label: 'Photo',         types: ['image/jpeg', 'image/png', 'image/webp'] },
  idDoc:         { label: 'ID',            types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  qualification: { label: 'Qualification', types: ['application/pdf'] }
};

/**
 * بترجع الفولدر الرئيسي، ولو مش موجود بتعمله وتحفظ الـ ID بتاعه
 */
function getRootFolder() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('ROOT_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (e) { /* اتمسح، نعمل واحد جديد */ }
  }
  const folder = DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

function validateFiles(data) {
  if (!data.files) throw new Error('No files received');

  Object.keys(FILE_RULES).forEach(function (key) {
    const f = data.files[key];
    if (!f || !f.base64) throw new Error('Missing file: ' + key);
    if (FILE_RULES[key].types.indexOf(f.mimeType) === -1) {
      throw new Error('File type not allowed: ' + key);
    }
    const approxBytes = f.base64.length * 3 / 4;   // حجم Base64 أكبر من الملف الأصلي بحوالي الثلث
    if (approxBytes > MAX_FILE_BYTES) throw new Error('File too large: ' + key);
  });
}

/**
 * بتعمل فولدر للموظف وتحفظ فيه الملفات، وترجع لينك الفولدر
 */
function saveFiles(data) {
  const date = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyy-MM-dd');
  const folder = getRootFolder().createFolder(date + ' - ' + data.fullName.trim());

  Object.keys(FILE_RULES).forEach(function (key) {
    const f = data.files[key];
    const ext = f.name.indexOf('.') > -1 ? '.' + f.name.split('.').pop().toLowerCase() : '';
    const blob = Utilities.newBlob(
      Utilities.base64Decode(f.base64),
      f.mimeType,
      FILE_RULES[key].label + ext          // نسمّي الملفات أسماء موحدة
    );
    folder.createFile(blob);
  });

  return folder.getUrl();
}

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

  validateOnServer(data);
  validateFiles(data);

  // نحفظ الملفات الأول (برّه القفل لأنها بتاخد وقت)
  const folderUrl = saveFiles(data);

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
      data.lang,
      folderUrl
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

