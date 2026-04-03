import { getDb, saveDatabase } from './schema'

export function seedDemoData(): void {
  const db = getDb()

  // Check if already seeded
  const existing = db.prepare('SELECT COUNT(*) as count FROM items')
  existing.step()
  const count = existing.getAsObject().count as number
  existing.free()
  if (count > 0) return

  // Item groups
  const groups = [
    ['Breakfast', 'فطور'],
    ['Sandwich', 'ساندويش'],
    ['Main Dishes', 'الأطباق الرئيسية'],
    ['Salad', 'سلطات'],
    ['Coffee', 'قهوة'],
    ['Fresh Juices', 'المشروبات'],
    ['Desserts', 'الحلويات'],
    ['Bakery', 'قسم المخبوزات'],
    ['Acai', 'أساي'],
    ['Other Beverages', 'مشروبات أخرى']
  ]

  for (const [name, nameAr] of groups) {
    db.run('INSERT OR IGNORE INTO item_groups (name, name_ar) VALUES (?, ?)', [name, nameAr])
  }

  // Items from Garden Cafe menu
  const items: [string, string, string, string, number][] = [
    // Breakfast
    ['BCR-001', 'Bacon Beef Croissant', 'بايكون بيف كرواسان', 'Breakfast', 35],
    ['PNM-001', 'Panino di Maria', 'بانينو دي ماريا', 'Breakfast', 38],
    ['BRS-001', 'Bruschetta', 'بروشكيتا', 'Breakfast', 34],
    // Sandwich
    ['CPR-001', 'Caprese', 'كابريزي', 'Sandwich', 35],
    ['PSC-001', 'Pesto Chicken', 'بيستو شيكن', 'Sandwich', 38],
    ['TKC-001', 'Turkey & Cheese', 'تركي شيز', 'Sandwich', 34],
    ['BRZ-001', 'Bre-zaola', 'بريزاولا', 'Sandwich', 38],
    ['BST-001', 'Beef Steak Sandwich', 'دي بستيكا ساندويش', 'Sandwich', 42],
    // Main Dishes
    ['SLH-001', 'Salmon Hollandaise', 'سالمون هولانديز', 'Main Dishes', 90],
    ['BSG-001', 'Beef Stroganoff', 'بيف استرغانوف', 'Main Dishes', 70],
    ['CKE-001', 'Chicken Emance', 'تشكن إيمانسه', 'Main Dishes', 55],
    ['LSG-001', 'Lasagna', 'لازانيا', 'Main Dishes', 60],
    // Salad
    ['KSP-001', 'Kale & Sweet Potato', 'الكايل و البطاطا الحلوة', 'Salad', 39],
    ['AVC-001', 'Avocado Citrus', 'سلطة افوكادو سيتروس', 'Salad', 38],
    ['OLG-001', 'Garden Salad', 'سلطة الحديقة', 'Salad', 41],
    ['DBS-001', 'Di Bistecca Salad', 'دي بستيكا سالاد', 'Salad', 48],
    ['CKL-001', 'Chicken Luna', 'تشكن لونا سالاد', 'Salad', 48],
    // Coffee
    ['ESP-001', 'Espresso', 'إسبريسو', 'Coffee', 18],
    ['DOP-001', 'Doppio', 'دوبّيو', 'Coffee', 25],
    ['AMR-001', 'Americano', 'اميريكانو', 'Coffee', 20],
    ['CAP-001', 'Cappuccino', 'كابتشينو', 'Coffee', 26],
    ['LAT-001', 'Latte', 'لاتيه', 'Coffee', 27],
    ['CRT-001', 'Cortado', 'كورتادو', 'Coffee', 23],
    ['MCH-001', 'Macchiato', 'ماكياتو', 'Coffee', 24],
    ['FLW-001', 'Flat White', 'فلاتوايت', 'Coffee', 26],
    ['V60-001', 'V60', 'V60', 'Coffee', 35],
    // Fresh Juices
    ['ORJ-001', 'Orange Juice', 'برتقال طازج', 'Fresh Juices', 25],
    ['CRJ-001', 'Carrot Juice', 'جزر طازج', 'Fresh Juices', 25],
    ['GNG-001', 'Gingerly', 'جنجرلي', 'Fresh Juices', 26],
    ['BTB-001', 'Beet Boost', 'بيت بوست', 'Fresh Juices', 23],
    ['VRD-001', 'Vai Verde', 'فيردي', 'Fresh Juices', 24],
    // Desserts
    ['TRM-001', 'Tiramisu', 'تيراميسو', 'Desserts', 44],
    ['CRC-001', 'Carrot Cake', 'كيك الجزر', 'Desserts', 39],
    ['DTC-001', 'Date Cake', 'كيك التمر', 'Desserts', 42],
    ['SNS-001', 'San Sebastian', 'سان سباستيان', 'Desserts', 44],
    // Bakery
    ['FOC-001', 'Focaccia Bread', 'خبز فوكاتشيا', 'Bakery', 15],
    ['SRD-001', 'Sour Dough Bread', 'خبز ساور دو', 'Bakery', 18],
    ['BGT-001', 'Baguette Bread', 'خبز باغيت', 'Bakery', 12],
    // Other Beverages
    ['WTR-001', 'Mineral Water 250ML', 'مياه معدنية صغير', 'Other Beverages', 8],
    ['WTR-002', 'Mineral Water 750ML', 'مياه معدنية كبير', 'Other Beverages', 15],
    ['SPW-001', 'Sparkling Water', 'مياه غازية', 'Other Beverages', 10],
    ['SFD-001', 'Soft Drink', 'مشروب غازية', 'Other Beverages', 10],
    ['RDB-001', 'Red Bull', 'ريد بول', 'Other Beverages', 20],
  ]

  for (const [code, name, nameAr, group, rate] of items) {
    db.run(
      `INSERT OR IGNORE INTO items (item_code, item_name, item_name_ar, item_group, rate, is_available, is_visible)
       VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [code, name, nameAr, group, rate]
    )
  }

  // Payment methods
  const methods = [
    ['Cash', 'Cash', 1],
    ['Card', 'Card', 0],
    ['Mobile Payment', 'Mobile Payment', 0]
  ]

  for (const [name, mode, isDefault] of methods) {
    db.run('INSERT OR IGNORE INTO payment_methods (name, mode_of_payment, is_default) VALUES (?, ?, ?)',
      [name, mode, isDefault])
  }

  // Demo modifier groups
  db.run(`INSERT OR IGNORE INTO modifier_groups (id, group_name, selection_type, is_required, max_selections)
    VALUES ('mg-spice', 'Spice Level', 'Single', 0, 0)`)
  db.run(`INSERT OR IGNORE INTO modifier_groups (id, group_name, selection_type, is_required, max_selections)
    VALUES ('mg-addons', 'Add-ons', 'Multiple', 0, 3)`)

  // Modifiers
  const modifiers = [
    ['mod-mild', 'mg-spice', 'Mild', 0],
    ['mod-medium', 'mg-spice', 'Medium', 0],
    ['mod-hot', 'mg-spice', 'Hot', 0],
    ['mod-cheese', 'mg-addons', 'Extra Cheese', 4],
    ['mod-avocado', 'mg-addons', 'Avocado', 8],
    ['mod-bacon', 'mg-addons', 'Beef Bacon', 6],
  ]

  for (const [id, groupId, name, price] of modifiers) {
    db.run('INSERT OR IGNORE INTO modifiers (id, modifier_group_id, modifier_name, price) VALUES (?, ?, ?, ?)',
      [id, groupId, name, price])
  }

  // Assign modifiers to sandwich items
  const sandwichItems = ['CPR-001', 'PSC-001', 'TKC-001', 'BRZ-001', 'BST-001']
  let imgIdx = 0
  for (const itemCode of sandwichItems) {
    db.run('INSERT OR IGNORE INTO item_modifier_groups (id, item_code, modifier_group_id, is_required, display_order) VALUES (?, ?, ?, 0, 0)',
      [`img-${imgIdx++}`, itemCode, 'mg-spice'])
    db.run('INSERT OR IGNORE INTO item_modifier_groups (id, item_code, modifier_group_id, is_required, display_order) VALUES (?, ?, ?, 0, 1)',
      [`img-${imgIdx++}`, itemCode, 'mg-addons'])
  }

  // Demo tables & rooms
  db.run(`INSERT OR IGNORE INTO rooms (name, room_name, description) VALUES ('main-hall', 'Main Hall', 'Indoor seating')`)
  db.run(`INSERT OR IGNORE INTO rooms (name, room_name, description) VALUES ('terrace', 'Terrace', 'Outdoor seating')`)

  for (let i = 1; i <= 8; i++) {
    db.run(`INSERT OR IGNORE INTO tables_list (name, table_name, room, capacity) VALUES (?, ?, ?, ?)`,
      [`table-${i}`, `T${String(i).padStart(2, '0')}`, i <= 5 ? 'main-hall' : 'terrace', i <= 4 ? 4 : 6])
  }

  saveDatabase()
}
