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