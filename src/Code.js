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

  sendEmails(data, folderUrl); 
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

// ===== الإيميلات =====
const DEPARTMENTS = {
  HR:    { ar: 'الموارد البشرية',       en: 'Human Resources' },
  FIN:   { ar: 'المالية',               en: 'Finance' },
  IT:    { ar: 'تكنولوجيا المعلومات',    en: 'Information Technology' },
  SALES: { ar: 'المبيعات',              en: 'Sales' },
  OPS:   { ar: 'العمليات',              en: 'Operations' }
};

/**
 * بتمنع أي حد يكتب كود HTML في الفورم يبوّظ شكل الإيميل
 */
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/**
 * القالب العام لأي إيميل: هيدر بلون الشركة + المحتوى
 */
function emailLayout(title, bodyHtml, dir) {
  return '<div dir="' + dir + '" style="font-family:Tahoma,Arial,sans-serif;background:#f4f7f8;padding:24px;">' +
           '<div style="max-width:600px;margin:auto;background:#ffffff;border-radius:10px;overflow:hidden;">' +
             '<div style="background:#0f4c5c;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold;">' +
               escapeHtml(title) +
             '</div>' +
             '<div style="padding:24px;color:#1f2933;line-height:1.8;">' + bodyHtml + '</div>' +
           '</div>' +
         '</div>';
}

function buildAdminEmail(data, folderUrl) {
  const rows = [
    ['Full Name', data.fullName],
    ['Nationality', data.nationality === 'EG' ? 'Egyptian' : 'Non-Egyptian'],
    data.nationality === 'EG'
      ? ['National ID', data.nationalId]
      : ['Passport No', data.passportNo],
    ['Phone', data.phone],
    ['Email', data.email],
    ['Department', DEPARTMENTS[data.department] ? DEPARTMENTS[data.department].en : data.department],
    ['Hire Date', data.hireDate]
  ];

  const table = '<table style="width:100%;border-collapse:collapse;">' +
    rows.map(function (r) {
      return '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:35%;">' + r[0] + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:bold;">' + escapeHtml(r[1]) + '</td>' +
      '</tr>';
    }).join('') +
  '</table>';

  const button = '<p style="text-align:center;margin-top:24px;">' +
    '<a href="' + folderUrl + '" style="background:#e36414;color:#ffffff;padding:12px 24px;' +
    'border-radius:6px;text-decoration:none;font-weight:bold;">Open Documents Folder</a></p>';

  return emailLayout('New Employee Submission', '<p>A new employee has submitted the onboarding form:</p>' + table + button, 'ltr');
}

function buildEmployeeEmail(data) {
  const isAr = data.lang === 'ar';
  const name = escapeHtml(data.fullName.trim());

  const body = isAr
    ? '<p>أهلًا ' + name + '،</p>' +
      '<p>استلمنا بياناتك ومستنداتك بنجاح، وفريق الموارد البشرية هيراجعها ويتواصل معاك قريب.</p>' +
      '<p>مرحبًا بيك في مجموعة نوفا 🎉</p>'
    : '<p>Hello ' + name + ',</p>' +
      '<p>We have successfully received your information and documents. Our HR team will review them and contact you soon.</p>' +
      '<p>Welcome to Nova Group 🎉</p>';

  return emailLayout(isAr ? 'مجموعة نوفا' : 'Nova Group', body, isAr ? 'rtl' : 'ltr');
}

function sendEmails(data, folderUrl) {
  const adminEmail = PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL');

  // إيميل المسؤول
  if (adminEmail) {
    try {
      MailApp.sendEmail({
        to: adminEmail,
        subject: 'New Employee: ' + data.fullName.trim(),
        htmlBody: buildAdminEmail(data, folderUrl),
        name: 'Nova Onboarding'
      });
    } catch (e) {
      console.error('Admin email failed: ' + e);
    }
  }

  // إيميل تأكيد للموظف
  try {
    MailApp.sendEmail({
      to: data.email.trim(),
      subject: data.lang === 'ar' ? 'تم استلام بياناتك — مجموعة نوفا' : 'We received your details — Nova Group',
      htmlBody: buildEmployeeEmail(data),
      name: 'Nova Group'
    });
  } catch (e) {
    console.error('Employee email failed: ' + e);
  }
}
