import { create } from 'zustand'

// UI language for the till chrome (labels, buttons, messages). Separate from the item-name
// EN / AR / Both toggle on the menu. English strings are the keys; missing Arabic falls back
// to English. Stored per till in localStorage and mirrored to config `ui_language`.

export type UiLang = 'en' | 'ar'
const KEY = 'pos_ui_lang'

const AR: Record<string, string> = {
  // sign in
  'Who is on the till': 'من على الكاشير',
  'Enter your PIN': 'أدخل الرقم السري',
  '{name}, enter your PIN': '{name}، أدخل رقمك السري',
  'Sign in': 'دخول',
  'Checking…': 'جارٍ التحقق…',
  'Enter 6 to 8 digits': 'أدخل من 6 إلى 8 أرقام',
  'Signs in by itself once the PIN is right': 'يتم الدخول تلقائياً عند صحة الرقم',
  'Invalid PIN': 'رقم سري غير صحيح',
  'PIN must be at least 6 digits': 'الرقم السري 6 أرقام على الأقل',
  'That PIN isn’t {name}’s': 'هذا ليس الرقم السري لـ {name}',
  'Supervisor tools': 'أدوات المشرف',
  'ERPNext set up': 'ERPNext مُعد',
  'ERPNext not set up': 'ERPNext غير مُعد',
  '{n} printers set up': '{n} طابعات مُعدة',
  'No printer set up': 'لا توجد طابعة',
  'A shift is open on this till': 'توجد وردية مفتوحة',
  'No shift open on this till': 'لا توجد وردية مفتوحة',
  'Checking the shift…': 'جارٍ فحص الوردية…',
  'Staff appear here once they are added in Supervisor tools.': 'يظهر الموظفون هنا بعد إضافتهم من أدوات المشرف.',
  // status band
  'Offline': 'غير متصل',
  'ERPNext error': 'خطأ ERPNext',
  'Printers {n}': 'الطابعات {n}',
  'Syncing…': 'جارٍ المزامنة…',
  '{n} failed to sync': '{n} فشلت مزامنتها',
  '{n} to sync': '{n} بانتظار المزامنة',
  'All synced': 'تمت المزامنة',
  'Waiter app': 'تطبيق النادل',
  'Waiter app · {n} new': 'تطبيق النادل · {n} جديد',
  'Sync complete': 'اكتملت المزامنة',
  // rail / orders
  'All open': 'كل المفتوحة',
  'New order': 'طلب جديد',
  'Open orders': 'الطلبات المفتوحة',
  'Not sent': 'لم يُرسل',
  'In kitchen': 'في المطبخ',
  'Ready': 'جاهز',
  'On hold': 'معلّق',
  'Bill printed': 'طُبعت الفاتورة',
  'Late': 'متأخر',
  'Back': 'رجوع',
  'Back to {name}': 'رجوع إلى {name}',
  'All': 'الكل',
  'Dine in': 'محلي',
  'Takeaway': 'سفري',
  'Delivery': 'توصيل',
  'With waiter': 'مع نادل',
  'Late first, then oldest': 'المتأخر أولاً ثم الأقدم',
  'No open orders': 'لا توجد طلبات مفتوحة',
  'No orders match': 'لا توجد طلبات مطابقة',
  'Void order': 'إلغاء الطلب',
  'Open on the till': 'فتح على الكاشير',
  'Print invoice': 'طباعة الفاتورة',
  // menu
  'Popular': 'الأكثر طلباً',
  'All items': 'كل الأصناف',
  'Search': 'بحث',
  'Space': 'مسافة',
  'Clear': 'مسح',
  'Done': 'تم',
  '{n} results': '{n} نتيجة',
  'Nothing matches': 'لا توجد نتائج',
  'choose': 'اختر',
  'Add to a sent order?': 'إضافة إلى طلب مُرسل؟',
  'Add item': 'إضافة الصنف',
  'Cancel': 'إلغاء',
  'Add to order': 'أضف للطلب',
  'Close': 'إغلاق',
  // ticket
  'New': 'جديد',
  'Sent': 'أُرسل',
  'Sent {time}': 'أُرسل {time}',
  'Send': 'إرسال',
  'Send {n}': 'إرسال {n}',
  'Sending…': 'جارٍ الإرسال…',
  'Hold': 'تعليق',
  'Pay': 'دفع',
  'Subtotal': 'المجموع الفرعي',
  '{n} items': '{n} أصناف',
  'Add discount': 'إضافة خصم',
  'Change discount': 'تعديل الخصم',
  'Nothing on the ticket': 'لا شيء في الطلب',
  'Tap the menu to add items, or open an order from the rail.': 'اختر أصنافاً من القائمة أو افتح طلباً من الشريط.',
  'Reprint KOT': 'إعادة طباعة المطبخ',
  'Kitchen note': 'ملاحظة للمطبخ',
  'Note': 'ملاحظة',
  'Discount': 'خصم',
  'Void': 'إلغاء',
  'Remove': 'حذف',
  'Order details': 'تفاصيل الطلب',
  'Order type': 'نوع الطلب',
  'Table and guests': 'الطاولة والضيوف',
  'Choose a table': 'اختر طاولة',
  'Waiter': 'النادل',
  'None': 'بدون',
  'Order note': 'ملاحظة الطلب',
  'Print': 'طباعة',
  'Order': 'الطلب',
  'Save without KOT': 'حفظ بدون طباعة للمطبخ',
  'Hold this order first?': 'تعليق هذا الطلب أولاً؟',
  'Hold and continue': 'تعليق ومتابعة',
  'Stay': 'البقاء',
  'Discard this ticket?': 'تجاهل هذا الطلب؟',
  'Discard': 'تجاهل',
  'Keep': 'إبقاء',
  // payment
  'To pay': 'المطلوب',
  'Split': 'تقسيم',
  'Tip': 'إكرامية',
  'Cash received': 'المبلغ المستلم',
  'Amount': 'المبلغ',
  'Exact': 'بالضبط',
  'Change': 'الباقي',
  'Still owed': 'المتبقي',
  'Finish sale': 'إتمام البيع',
  'Completing…': 'جارٍ الإتمام…',
  'Done, printing': 'تم، جارٍ الطباعة',
  'Tap for the next order': 'اضغط للطلب التالي',
  'Print 2 copies': 'طباعة نسختين',
  'No receipt': 'بدون إيصال',
  'Prints the receipt': 'يطبع الإيصال',
  'Collected by cashier': 'استلمه الكاشير',
  'Collected by {name}': 'استلمه {name}',
  '+ Add another method': '+ إضافة طريقة أخرى',
  'Tip on {method}': 'إكرامية على {method}',
  'Charged exactly what is owed. Use Tip to add a tip.': 'يُخصم المبلغ المطلوب فقط. استخدم الإكرامية لإضافة إكرامية.',
  'Charged exactly what is owed.': 'يُخصم المبلغ المطلوب فقط.',
  'Fully covered': 'مغطى بالكامل',
  'Left to split {amount}': 'المتبقي للتقسيم {amount}',
  // void
  'Why': 'السبب',
  'Other': 'أخرى',
  'Type the reason': 'اكتب السبب',
  'Was it made?': 'هل تم تحضيره؟',
  'Yes, record as waste': 'نعم، يُسجل كهدر',
  'No, return the stock': 'لا، أعده للمخزون',
  '+ Add a remark': '+ إضافة ملاحظة',
  'Remarks': 'ملاحظات',
  'Keep it': 'إبقاء',
  'Choose why': 'اختر السبب',
  'Needs the supervisor PIN': 'يحتاج رقم المشرف',
  'Supervisor PIN': 'رقم المشرف السري',
  'A supervisor enters their PIN to approve.': 'يُدخل المشرف رقمه للموافقة.',
  'Approved by {name}': 'وافق {name}',
  'Voiding…': 'جارٍ الإلغاء…',
  'Void {n} · {amount}': 'إلغاء {n} · {amount}',
  'Void order · {amount}': 'إلغاء الطلب · {amount}',
  '{name} is not a supervisor': '{name} ليس مشرفاً',
  // shifts
  'Open shift': 'فتح الوردية',
  'Close shift': 'إغلاق الوردية',
  'Count the float in the drawer': 'عُدّ النقد الافتتاحي في الدرج',
  'Count the cash in the drawer': 'عُدّ النقد في الدرج',
  'Type a total': 'أدخل المجموع',
  'Count notes': 'عدّ الأوراق',
  'Counted cash': 'النقد المعدود',
  'Finished counting, compare': 'انتهيت من العد، قارن',
  'Opening float': 'النقد الافتتاحي',
  'Cash sales': 'المبيعات النقدية',
  'Expected in drawer': 'المتوقع في الدرج',
  'Drawer matches': 'الدرج مطابق',
  'Shift totals': 'إجماليات الوردية',
  'Count first': 'عُدّ أولاً',
  'Clear the blockers': 'عالج العوائق أولاً',
  'Sign out': 'خروج',
  'Recount': 'إعادة العد',
  'Sync now': 'مزامنة الآن',
  // menu
  'Sales today': 'مبيعات اليوم',
  'Kitchen view': 'شاشة المطبخ',
  'Settings': 'الإعدادات',
  'Language: English': 'اللغة: العربية',
  // inactivity
  'Still there?': 'هل ما زلت هنا؟',
  'Signing out in {n}s. The open order will be put on hold.': 'سيتم تسجيل الخروج خلال {n} ث. سيتم تعليق الطلب المفتوح.',
  "I'm here": 'أنا هنا',
  'guest': 'ضيف',
  'guests': 'ضيوف',
  'item': 'صنف',
  'items': 'أصناف',
  'since {time}': 'منذ {time}',
  'Tap to pick a table, guests and waiter': 'اضغط لاختيار الطاولة والضيوف والنادل',
  'Tap for waiter and notes': 'اضغط للنادل والملاحظات',
  'Void from {label}': 'إلغاء من {label}',
  'Remove from {label}': 'حذف من {label}',
  'Already in the kitchen. A cancel slip prints there and this is logged under {name}.': 'الطلب في المطبخ. تُطبع ورقة إلغاء هناك ويُسجل باسم {name}.',
  'Saved on the order but not sent to the kitchen. Logged under {name}.': 'محفوظ في الطلب ولم يُرسل للمطبخ. يُسجل باسم {name}.',
  'Quick sale': 'بيع سريع',
  // toasts
  'Retry': 'إعادة المحاولة'
}

interface LangState {
  lang: UiLang
  setLang: (l: UiLang) => void
}

function apply(l: UiLang) {
  try {
    document.documentElement.lang = l
    document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'
  } catch { /* no DOM */ }
}

function initial(): UiLang {
  try { return localStorage.getItem(KEY) === 'ar' ? 'ar' : 'en' } catch { return 'en' }
}

export const useLang = create<LangState>((set) => ({
  lang: initial(),
  setLang: (lang) => {
    try { localStorage.setItem(KEY, lang) } catch {}
    try { window.api?.config?.set('ui_language', lang) } catch {}
    apply(lang)
    set({ lang })
  }
}))
apply(useLang.getState().lang)

/** Translate an English UI string; {name} placeholders are filled from vars. */
export function t(s: string, vars?: Record<string, string | number>): string {
  const lang = useLang.getState().lang
  let out = lang === 'ar' && AR[s] ? AR[s] : s
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v))
  return out
}

/** Same as t, but subscribes the component so it re-renders on a language change. */
export function useT() {
  useLang((s) => s.lang)
  return t
}
